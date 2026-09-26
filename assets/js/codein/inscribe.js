// inscribe.js - the write flow for one inscription (Model B).
// The user's wallet only signs the funding transfer; the reused burner signs
// every chunk (v1 4KB, no popups) and writes the row into the feed table while
// referencing the user's inventory PDA, so getSignaturesForAddress finds the
// same write under both the board (feed table) and my inventory (user PDA).
// Leftover is swept back to the user.
import { contract, writer } from "@iqlabs-official/solana-sdk";
import { SystemProgram, Transaction } from "@solana/web3.js";
import { dbRootSeed, feedSeed, programId } from "./feed.js";
import { estimateCost, getAccountRent } from "./cost.js?v=4";

const TX_FEE = 5000;
// A system account may not be left with 0 < balance < rent-exempt minimum, so
// the funding transfer must leave the wallet either empty or above this.
const RENT_MIN = 890880;

// Derive the burner once per session (see burner.js) and pass it in, so the
// user signs signMessage once rather than on every inscription. speed and
// onProgress flow to the SDK: the caller passes a faster speed when the user
// registered their own RPC, and onProgress drives the progress bar.
export async function inscribe({ connection, wallet, burner, kind, body, speed, onProgress, onRetry }) {
  const row = JSON.stringify({ kind, body, who: wallet.publicKey.toBase58() });
  const bytes = new TextEncoder().encode(row).length;

  const { total } = estimateCost(bytes, { accountRent: await getAccountRent(connection, burner.publicKey) });

  await topUp(connection, wallet, burner.publicKey, total);

  const userInvPda = contract.getUserInventoryPda(wallet.publicKey, programId);
  // One in-place retry: the burner keeps the funds and chunks are cheap to
  // re-send, and the SDK already absorbs false blockheight expiries at the
  // chunk level. Kept at one pass to stay clear of rate limits; beyond that
  // the UI offers a manual RETRY that reuses the burner balance.
  let sig;
  for (let attempt = 1; ; attempt++) {
    try {
      sig = await writer.writeRow(connection, burner, dbRootSeed, feedSeed, row, false, [userInvPda], { speed, onProgress });
      break;
    } catch (e) {
      if (attempt >= 2) throw e;
      console.warn("[code-in] write attempt " + attempt + " did not finish, retrying:", e && e.message);
      if (onRetry) onRetry(attempt);
      // Top the burner back up for the extra session; usually a no-op thanks
      // to the sweep margin, and init rent drops out once the init landed.
      const accountRent = await getAccountRent(connection, burner.publicKey);
      await topUp(connection, wallet, burner.publicKey, estimateCost(bytes, { accountRent }).total);
    }
  }

  // Best-effort: the inscription is already on-chain, so a sweep hiccup must
  // not surface as a failure. Leftover stays in the burner and shrinks the
  // next topUp anyway.
  await sweep(connection, burner, wallet.publicKey).catch((e) => console.warn("[code-in] sweep skipped:", e && e.message));
  return { sig };
}

// Fund the burner up to `target`, sending only the shortfall so a reused burner
// with leftover balance costs less. The user signs this one transfer.
async function topUp(connection, wallet, burnerPubkey, target) {
  const have = await connection.getBalance(burnerPubkey);
  if (have >= target) return;
  const need = target - have;
  // Fail early with a clear message when the connected wallet cannot cover the
  // transfer + fee, instead of a cryptic "Transaction simulation failed".
  const walletBal = await connection.getBalance(wallet.publicKey);
  // RENT_MIN: paying exactly the shortfall would otherwise leave a dust balance
  // below rent exemption, which the runtime rejects as
  // "account (0) with insufficient funds for rent".
  if (walletBal < need + TX_FEE + RENT_MIN) {
    throw new Error(
      "insufficient SOL in your wallet: need ~" + ((need + TX_FEE + RENT_MIN) / 1e9).toFixed(4) +
      " SOL (~0.0009 of it must stay in your wallet for rent), have " +
      (walletBal / 1e9).toFixed(4) + " SOL. fund the connected wallet and retry.",
    );
  }
  // An expired tx can never land after lastValidBlockHeight, so re-sending
  // with a fresh blockhash cannot double-spend; and the shortfall is
  // recomputed, so a transfer that did land makes the retry a no-op.
  // Each attempt asks the wallet to sign again.
  for (let attempt = 0; ; attempt++) {
    const shortfall = target - (await connection.getBalance(burnerPubkey));
    if (shortfall <= 0) return;
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: wallet.publicKey }).add(
      SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: burnerPubkey, lamports: shortfall }),
    );
    const signed = await wallet.signTransaction(tx);
    const sig = await sendRaw(connection, signed);
    const landed = await confirmOrCheck(connection, sig, blockhash, lastValidBlockHeight);
    if (landed || (await connection.getBalance(burnerPubkey)) >= target) return;
    if (attempt >= 1) {
      throw new Error("funding transfer expired twice (congested RPC). nothing was spent; retry, or add your own RPC.");
    }
    console.warn("[code-in] funding transfer expired, retrying with a fresh blockhash");
  }
}

// Confirm a tx, but do not trust "block height exceeded" blindly: on congested
// public RPCs the tx frequently lands anyway, so poll its status before giving
// up. Returns false only when the signature never shows up as confirmed.
async function confirmOrCheck(connection, sig, blockhash, lastValidBlockHeight) {
  try {
    const result = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    if (result.value.err) throw new Error("transfer " + sig + " failed: " + JSON.stringify(result.value.err));
    return true;
  } catch (e) {
    if (!e || e.name !== "TransactionExpiredBlockheightExceededError") throw e;
    for (let i = 0; i < 5; i++) {
      const st = (await connection.getSignatureStatuses([sig])).value[0];
      if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
        if (st.err) throw new Error("transfer " + sig + " failed: " + JSON.stringify(st.err));
        return true;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return false;
  }
}

// Send a signed tx, folding any preflight simulation logs into the thrown error
// so the UI shows the real on-chain cause, not just "simulation failed".
async function sendRaw(connection, signed) {
  try {
    return await connection.sendRawTransaction(signed.serialize());
  } catch (e) {
    let logs = e && e.logs;
    if (!logs && e && typeof e.getLogs === "function") { try { logs = await e.getLogs(connection); } catch (_) {} }
    if (logs && logs.length) e.message = (e.message || "send failed") + " | logs: " + logs.join(" ; ");
    throw e;
  }
}

// Exported so the UI can also refund the burner to the wallet after a write
// ultimately gives up. Returns the lamports sent back (0 when nothing to send).
export async function sweep(connection, burner, to) {
  const balance = await connection.getBalance(burner.publicKey);
  if (balance <= TX_FEE) return 0;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: burner.publicKey }).add(
    SystemProgram.transfer({ fromPubkey: burner.publicKey, toPubkey: to, lamports: balance - TX_FEE }),
  );
  tx.sign(burner);
  const sig = await sendRaw(connection, tx);
  if (!(await confirmOrCheck(connection, sig, blockhash, lastValidBlockHeight))) {
    throw new Error("refund transfer " + sig + " was not confirmed; check its status before retrying");
  }
  return balance - TX_FEE;
}
