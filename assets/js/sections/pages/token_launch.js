// Pump.fun token launcher for the Code In board (solana only).
// Fully on-chain metadata: the caller first inscribes the Metaplex JSON into
// the token-meta table (a code-in write) and passes the resulting uri here -
// gateway /meta/{tx}. The uri's path segment IS the inscription's tx
// signature, so the metadata (and through it the original inscription) stays
// recoverable from solana alone even if every iqlabs host disappears.
//
// This module only asks PumpPortal trade-local for the UNSIGNED create
// transaction, appends the platform fee transfer to that SAME transaction
// (atomic: the fee is only ever paid if the token creation lands), signs
// with the fresh mint keypair, then lets the user's wallet sign and send.
(function () {
  const FEE_WALLET = "5eCDJGbuS1k5ELso8h6fnMVEJpjmrCHoX1sS92Txa9Rh"; // platform fee destination
  const FEE_LAMPORTS = 69000000; // 0.069 SOL
  const PORTAL_URL = "https://pumpportal.fun/api/trade-local";
  const GATEWAY = "https://gateway.iqlabs.dev";

  // Returns { mint, sig }. onStep(label) reports coarse progress.
  async function launch(opts) {
    const w3 = window.solanaWeb3;
    const step = opts.onStep || function () {};
    const provider = opts.provider;
    const owner = provider.publicKey;

    step("building the create transaction");
    const mintKp = w3.Keypair.generate();
    const res = await fetch(PORTAL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: owner.toBase58(),
        action: "create",
        tokenMetadata: { name: opts.name, symbol: opts.symbol, uri: opts.uri },
        mint: mintKp.publicKey.toBase58(),
        denominatedInSol: "true",
        amount: opts.devBuySol || 0,
        slippage: 10,
        priorityFee: 0.0005,
        pool: "pump",
      }),
    });
    if (!res.ok) throw new Error("pumpportal rejected the create (" + res.status + "): " + (await res.text()).slice(0, 200));
    const tx = w3.VersionedTransaction.deserialize(new Uint8Array(await res.arrayBuffer()));

    // The create tx uses an address lookup table (measured live: 1 ALT), so
    // decompiling requires the resolved table accounts, and the recompile
    // passes them back so the message stays within size.
    const conn = window.iqCodein.connect();
    const lookups = [];
    for (const l of tx.message.addressTableLookups) {
      const info = await conn.getAddressLookupTable(l.accountKey);
      if (!info || !info.value) throw new Error("could not resolve the create tx lookup table " + l.accountKey.toBase58());
      lookups.push(info.value);
    }

    // Append the platform fee inside the same message: it cannot be paid
    // without the create landing, and the create cannot land without it.
    // (Verified by mainnet simulation: pump create + this transfer both
    // execute, ~251k CU total.)
    const msg = w3.TransactionMessage.decompile(tx.message, { addressLookupTableAccounts: lookups });

    // Holder rewards (default): pump.fun's create_v2 takes trailing optional
    // args that PumpPortal omits (omitted = regular creator-fee coin), so
    // appending is_cashback=false + creator_fee_bps=0 + is_holder_reward=true
    // flips the coin to Holder Rewards (fees stream to holders, permanent).
    // The dev-buy then needs the holder creator vault: on these coins the
    // program stores bonding_curve.creator = PDA("holder-rewards", mint), so
    // the buy's creator_vault PDA derives from that instead of the wallet.
    // (Both verified by mainnet simulation against the live program.)
    if (opts.rewards !== "creator") {
      const B = window.buffer.Buffer;
      const PUMP_ID = new w3.PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
      const CREATE_V2_DISC = [0xd6, 0x90, 0x4c, 0xec, 0x5f, 0x8b, 0x31, 0xb4];
      const holderCreator = w3.PublicKey.findProgramAddressSync(
        [B.from("holder-rewards"), mintKp.publicKey.toBuffer()], PUMP_ID)[0];
      const holderVault = w3.PublicKey.findProgramAddressSync(
        [B.from("creator-vault"), holderCreator.toBuffer()], PUMP_ID)[0];
      const walletVault = w3.PublicKey.findProgramAddressSync(
        [B.from("creator-vault"), owner.toBuffer()], PUMP_ID)[0];
      let patched = false;
      for (const ix of msg.instructions) {
        const d = ix.data;
        if (ix.programId.equals(PUMP_ID) && d.length >= 8 && CREATE_V2_DISC.every((b, i) => d[i] === b)) {
          ix.data = B.concat([B.from(d), B.from([0]), B.alloc(8, 0), B.from([1])]);
          patched = true;
        }
        for (const k of ix.keys) if (k.pubkey.equals(walletVault)) k.pubkey = holderVault;
      }
      if (!patched) throw new Error("could not enable holder rewards: the create instruction did not match create_v2. launch aborted before any signature - retry, or pick creator rewards.");
    }
    msg.instructions.push(w3.SystemProgram.transfer({
      fromPubkey: owner,
      toPubkey: new w3.PublicKey(FEE_WALLET),
      lamports: FEE_LAMPORTS,
    }));
    const withFee = new w3.VersionedTransaction(msg.compileToV0Message(lookups));
    withFee.sign([mintKp]);

    step("approve the transaction in your wallet");
    const sent = await provider.signAndSendTransaction(withFee);
    const sig = (sent && sent.signature) || sent;

    step("confirming on solana");
    // Poll instead of confirmTransaction: PumpPortal picked the blockhash,
    // and polling survives RPC websocket hiccups.
    for (let i = 0; i < 40; i++) {
      const st = await conn.getSignatureStatuses([sig]);
      const s = st && st.value && st.value[0];
      if (s && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized")) {
        if (s.err) throw new Error("transaction failed on chain: " + JSON.stringify(s.err));
        return { mint: mintKp.publicKey.toBase58(), sig: sig };
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new Error("confirmation timed out - check the signature on solscan: " + sig);
  }

  window.iqTokenLaunch = { launch, FEE_SOL: FEE_LAMPORTS / 1e9, FEE_WALLET, GATEWAY };
})();
