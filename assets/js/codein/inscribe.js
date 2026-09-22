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
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: wallet.publicKey }).add(
    SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: burnerPubkey, lamports: target - have }),
  );
  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
}

async function sweep(connection, burner, to) {
  const balance = await connection.getBalance(burner.publicKey);
  if (balance <= TX_FEE) return;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: burner.publicKey }).add(
    SystemProgram.transfer({ fromPubkey: burner.publicKey, toPubkey: to, lamports: balance - TX_FEE }),
  );
  tx.sign(burner);
  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
}
