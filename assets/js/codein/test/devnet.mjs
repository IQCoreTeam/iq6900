// devnet test of the core modules: deterministic burner, reused-burner cost
// amortization, the full write flow, and both reads. Not shipped to the browser.
//   node test/devnet.mjs <user-keypair.json>
import { readFileSync } from "node:fs";
import { Connection, Keypair } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { setRpcUrl, reader, contract } from "@iqlabs-official/solana-sdk";
import { deriveBurner } from "../burner.js";
import { inscribe } from "../inscribe.js";
import { feedTablePda, dbRootPda, programId } from "../feed.js";

const RPC = process.env.RPC || "https://devnet.helius-rpc.com/?api-key=fbb113ce-eeb4-4277-8c44-7153632d175a";
setRpcUrl(RPC);
const connection = new Connection(RPC, "confirmed");
const user = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.argv[2], "utf8"))));

// wallet-adapter shim: signs the funding tx; signMessage is deterministic ed25519.
const wallet = { publicKey: user.publicKey, signTransaction: async (tx) => { tx.partialSign(user); return tx; } };
const signMessage = async (msg) => ed25519.sign(msg, user.secretKey.slice(0, 32));

const sol = (l) => (l / 1e9).toFixed(4);
const secs = (t) => ((Date.now() - t) / 1000).toFixed(1) + "s";

if (!(await connection.getAccountInfo(dbRootPda))) throw new Error("feed not set up; run admin/setup-feed.mjs first");

// 1) deterministic: same signature -> same burner
const b1 = await deriveBurner(signMessage);
const b2 = await deriveBurner(signMessage);
console.log("[1] deterministic burner:", b1.publicKey.equals(b2.publicKey), b1.publicKey.toBase58());
const burner = b1;

// 2) inscribe once (first-time may pay init), timed + user cost
let bal = await connection.getBalance(user.publicKey);
let t = Date.now();
const r1 = await inscribe({ connection, wallet, burner, kind: "text", body: "gm one // " + Date.now() });
const spent1 = bal - (await connection.getBalance(user.publicKey));
console.log("[2] inscribe #1:", r1.sig.slice(0, 12), secs(t), "user spent", sol(spent1), "SOL");

// 3) inscribe again with the SAME burner (reused, no init) -> cheaper
bal = await connection.getBalance(user.publicKey);
t = Date.now();
const r2 = await inscribe({ connection, wallet, burner, kind: "text", body: "gm two // " + Date.now() });
const spent2 = bal - (await connection.getBalance(user.publicKey));
console.log("[3] inscribe #2:", r2.sig.slice(0, 12), secs(t), "user spent", sol(spent2), "SOL", "(reused burner)");

// 4) reads: board = feed table, my inventory = user inventory PDA (same reader)
const board = await reader.readTableRows(feedTablePda.toBase58(), { limit: 20 });
const userInv = contract.getUserInventoryPda(user.publicKey, programId);
const mine = await reader.readTableRows(userInv.toBase58(), { limit: 20 });
console.log("[4] board rows:", board.length, "| my inventory rows:", mine.length);

console.log("\n=== RESULT ===");
console.log(JSON.stringify({
  deterministic: b1.publicKey.equals(b2.publicKey),
  spent1_SOL: sol(spent1), spent2_SOL: sol(spent2),
  amortized: Number(spent2) < Number(spent1),
  boardRows: board.length, myRows: mine.length,
}, null, 2));
