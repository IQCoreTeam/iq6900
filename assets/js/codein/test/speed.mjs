// Speed + rate-limit measurement on free devnet RPC, to pick the browser
// size cap (above it, recommend the SDK). Uses the SDK light speed profile
// (2 rps, the built-in time break) so 429s stay near zero. Reuses one
// deterministic burner so we measure write throughput, not init.
//   node test/speed.mjs <user-keypair.json>
import { readFileSync } from "node:fs";
import { Connection, Keypair, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { setRpcUrl, writer, contract } from "@iqlabs-official/solana-sdk";
import { deriveBurner } from "../burner.js";
import { dbRootSeed, feedSeed, programId } from "../feed.js";

const RPC = process.env.RPC || "https://devnet.helius-rpc.com/?api-key=fbb113ce-eeb4-4277-8c44-7153632d175a";
const SIZES_KB = (process.env.SIZES || "4,16,32,64,100").split(",").map(Number);

const counts = {};
let http429 = 0;
const countingFetch = async (url, opt) => {
  try { const b = JSON.parse(opt.body); for (const r of (Array.isArray(b) ? b : [b])) counts[r.method] = (counts[r.method] || 0) + 1; } catch {}
  const res = await fetch(url, opt);
  if (res.status === 429) http429 += 1;
  return res;
};

setRpcUrl(RPC);
const connection = new Connection(RPC, { commitment: "confirmed", fetch: countingFetch });
const user = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.argv[2], "utf8"))));
const signMessage = async (msg) => ed25519.sign(msg, user.secretKey.slice(0, 32));
const userInv = contract.getUserInventoryPda(user.publicKey, programId);

const burner = await deriveBurner(signMessage);

// fund the burner once with plenty for the whole run
const need = 0.05e9;
if ((await connection.getBalance(burner.publicKey)) < need) {
  const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: user.publicKey, toPubkey: burner.publicKey, lamports: need - (await connection.getBalance(burner.publicKey)) }));
  await sendAndConfirmTransaction(connection, tx, [user], { commitment: "confirmed" });
}
console.log("burner:", burner.publicKey.toBase58(), "balance:", (await connection.getBalance(burner.publicKey)) / 1e9, "SOL\n");

const rows = [];
for (const kb of SIZES_KB) {
  const body = "IQ6900-".repeat(Math.ceil((kb * 1000) / 7)).slice(0, kb * 1000);
  const row = JSON.stringify({ kind: "text", body, who: user.publicKey.toBase58() });
  const bytes = new TextEncoder().encode(row).length;
  for (const k in counts) delete counts[k];
  http429 = 0;
  const t = Date.now();
  let ok = true, err = "";
  try {
    await writer.writeRow(connection, burner, dbRootSeed, feedSeed, row, false, [userInv]);
  } catch (e) { ok = false; err = String(e.message).slice(0, 70); }
  const secs = Number(((Date.now() - t) / 1000).toFixed(1));
  const calls = Object.values(counts).reduce((a, b) => a + b, 0);
  const chunks = Math.max(1, Math.ceil(bytes / 3600));
  rows.push({ kb, chunks, secs, calls, r429: http429, ok, err });
  console.log(`${String(kb).padStart(4)}KB | ${String(chunks).padStart(3)} chunks | ${String(secs).padStart(6)}s | ${String(calls).padStart(4)} rpc | ${http429} x429 | ${ok ? "OK" : "FAIL " + err}`);
}

// cap = largest size that finished with no 429 and under 60s
const clean = rows.filter((r) => r.ok && r.r429 === 0 && r.secs <= 60);
const cap = clean.length ? Math.max(...clean.map((r) => r.kb)) : 0;
console.log("\n=== RESULT ===");
console.log(JSON.stringify({ rows, recommendedBrowserCapKB: cap, aboveCap: "recommend the SDK / CLI" }, null, 2));
