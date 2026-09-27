// Pump.fun token launcher for the Code In board (solana only).
// Flow: build the coin image (an image inscription's own bytes, or the
// gateway /render card for text/ascii), pin image + metadata through
// pump.fun's IPFS endpoint (so every indexer displays it forever), then ask
// PumpPortal trade-local for the UNSIGNED create transaction, append the
// platform fee transfer to that SAME transaction (atomic: the fee is only
// ever paid if the token creation lands), sign with the fresh mint keypair,
// and let the user's wallet sign and send.
//
// Persistence: the metadata description carries the source inscription tx
// and a note that the content reassembles from solana with the IQ SDK even
// if this site disappears; the kind=token registry row stores the same
// mint -> inscription mapping on chain.
(function () {
  const FEE_WALLET = "5eCDJGbuS1k5ELso8h6fnMVEJpjmrCHoX1sS92Txa9Rh"; // platform fee destination
  const FEE_LAMPORTS = 69000000; // 0.069 SOL
  const IPFS_URL = "https://pump.fun/api/ipfs";
  const PORTAL_URL = "https://pumpportal.fun/api/trade-local";
  const GATEWAY = "https://gateway.iqlabs.dev";

  function dataUrlToBlob(dataUrl) {
    const at = dataUrl.indexOf("base64,");
    if (at < 0) throw new Error("the inscription image is not a base64 data url");
    const mime = (/^data:([^;,]+)/.exec(dataUrl) || [])[1] || "image/png";
    const bin = atob(dataUrl.slice(at + 7));
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: mime });
  }

  // pump.fun's IPFS endpoint pins the image and the metadata JSON in one call
  // and returns { metadataUri }; that uri goes on chain in the create.
  async function uploadMetadata(m) {
    const fd = new FormData();
    fd.append("file", m.imageBlob, m.fileName || "token.png");
    fd.append("name", m.name);
    fd.append("symbol", m.symbol);
    fd.append("description", m.description || "");
    if (m.twitter) fd.append("twitter", m.twitter);
    if (m.website) fd.append("website", m.website);
    fd.append("showName", "true");
    const res = await fetch(IPFS_URL, { method: "POST", body: fd });
    if (!res.ok) throw new Error("metadata upload failed (" + res.status + "): " + (await res.text()).slice(0, 200));
    const out = await res.json();
    if (!out || !out.metadataUri) throw new Error("metadata upload returned no uri");
    return out;
  }

  // Returns { mint, sig }. onStep(label) reports coarse progress.
  async function launch(opts) {
    const w3 = window.solanaWeb3;
    const step = opts.onStep || function () {};
    const provider = opts.provider;
    const owner = provider.publicKey;

    step("preparing the coin image");
    let imageBlob, fileName;
    if (opts.imageDataUrl) {
      imageBlob = dataUrlToBlob(opts.imageDataUrl); // the on-chain image, byte for byte
      fileName = opts.fileName || "onchain.png";
    } else {
      // text/ascii: the gateway renders the inscription as a terminal card
      const r = await fetch(GATEWAY + "/render/" + opts.renderSig);
      if (!r.ok) throw new Error("the gateway could not render the inscription card (" + r.status + ")");
      imageBlob = await r.blob();
      fileName = "card.png";
    }

    step("uploading image + metadata to pump.fun");
    const meta = await uploadMetadata({
      imageBlob: imageBlob,
      fileName: fileName,
      name: opts.name,
      symbol: opts.symbol,
      description: opts.description,
      twitter: opts.twitter,
      website: opts.website,
    });

    step("building the create transaction");
    const mintKp = w3.Keypair.generate();
    const res = await fetch(PORTAL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: owner.toBase58(),
        action: "create",
        tokenMetadata: { name: opts.name, symbol: opts.symbol, uri: meta.metadataUri },
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
