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
    if (tx.message.addressTableLookups && tx.message.addressTableLookups.length)
      throw new Error("unexpected lookup tables in the create transaction - cannot append the fee safely");

    // Append the platform fee inside the same message: it cannot be paid
    // without the create landing, and the create cannot land without it.
    const msg = w3.TransactionMessage.decompile(tx.message);
    msg.instructions.push(w3.SystemProgram.transfer({
      fromPubkey: owner,
      toPubkey: new w3.PublicKey(FEE_WALLET),
      lamports: FEE_LAMPORTS,
    }));
    const withFee = new w3.VersionedTransaction(msg.compileToV0Message());
    withFee.sign([mintKp]);

    step("approve the transaction in your wallet");
    const sent = await provider.signAndSendTransaction(withFee);
    const sig = (sent && sent.signature) || sent;

    step("confirming on solana");
    // Poll instead of confirmTransaction: PumpPortal picked the blockhash,
    // and polling survives RPC websocket hiccups.
    const conn = window.iqCodein.connect();
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
