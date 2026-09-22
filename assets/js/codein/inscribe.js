// inscribe.js - the write flow for one inscription (Model B).
// The user's wallet only signs the funding transfer; the reused burner signs
// every chunk (v1 4KB, no popups) and writes the row into the feed table while
// referencing the user's inventory PDA, so getSignaturesForAddress finds the
// same write under both the board (feed table) and my inventory (user PDA).
// Leftover is swept back to the user.
import { contract, writer } from "@iqlabs-official/solana-sdk";
import { SystemProgram, Transaction } from "@solana/web3.js";
import { dbRootSeed, feedSeed, programId } from "./feed.js";
import { estimateCost } from "./cost.js";

const TX_FEE = 5000;

// Derive the burner once per session (see burner.js) and pass it in, so the
// user signs signMessage once rather than on every inscription. speed and
// onProgress flow to the SDK: the caller passes a faster speed when the user
// registered their own RPC, and onProgress drives the progress bar.
export async function inscribe({ connection, wallet, burner, kind, body, speed, onProgress }) {
  const row = JSON.stringify({ kind, body, who: wallet.publicKey.toBase58() });
  const bytes = new TextEncoder().encode(row).length;

  const burnerInv = contract.getUserInventoryPda(burner.publicKey, programId);
  const firstTime = !(await connection.getAccountInfo(burnerInv));
  const { total } = estimateCost(bytes, { firstTime });

  await topUp(connection, wallet, burner.publicKey, total);

  const userInvPda = contract.getUserInventoryPda(wallet.publicKey, programId);
  const sig = await writer.writeRow(connection, burner, dbRootSeed, feedSeed, row, false, [userInvPda], { speed, onProgress });

  await sweep(connection, burner, wallet.publicKey);
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
  if (walletBal < need + TX_FEE) {
    throw new Error(
      "insufficient SOL in your wallet: need ~" + ((need + TX_FEE) / 1e9).toFixed(4) +
      " SOL, have " + (walletBal / 1e9).toFixed(4) + " SOL. fund the connected wallet and retry.",
    );
  }
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: wallet.publicKey }).add(
    SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: burnerPubkey, lamports: need }),
  );
  const signed = await wallet.signTransaction(tx);
  const sig = await sendRaw(connection, signed);
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
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

async function sweep(connection, burner, to) {
  const balance = await connection.getBalance(burner.publicKey);
  if (balance <= TX_FEE) return;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: burner.publicKey }).add(
    SystemProgram.transfer({ fromPubkey: burner.publicKey, toPubkey: to, lamports: balance - TX_FEE }),
  );
  tx.sign(burner);
  const sig = await sendRaw(connection, tx);
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
}
