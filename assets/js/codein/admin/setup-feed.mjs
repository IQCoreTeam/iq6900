// One-time admin: create the feed's db_root + table on the current cluster.
// Only the db_root creator can create the table; row writes stay open (no
// writers list) so any user's burner can post. Run once per cluster.
//   RPC=<url> node admin/setup-feed.mjs <owner-keypair.json>
import { readFileSync } from "node:fs";
import { Connection, Keypair, Transaction, sendAndConfirmTransaction, SystemProgram } from "@solana/web3.js";
import { contract, writer, setRpcUrl } from "@iqlabs-official/solana-sdk";
import { dbRootSeed, feedSeed, dbRootPda, feedTablePda, FEED_LABEL, FEED_COLUMNS, FEED_ID_COL } from "../feed.js";

const RPC = process.env.RPC || "https://api.devnet.solana.com";
const owner = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.argv[2], "utf8"))));
setRpcUrl(RPC);
const connection = new Connection(RPC, "confirmed");

if (!(await connection.getAccountInfo(dbRootPda))) {
  const ix = contract.initializeDbRootInstruction(
    contract.createInstructionBuilder(),
    { db_root: dbRootPda, signer: owner.publicKey, system_program: SystemProgram.programId },
    { db_root_id: Buffer.from(dbRootSeed) },
  );
  const sig = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [owner], { commitment: "confirmed" });
  console.log("db_root created", dbRootPda.toBase58(), sig);
} else console.log("db_root exists", dbRootPda.toBase58());

if (!(await connection.getAccountInfo(feedTablePda))) {
  const sig = await writer.createTable(connection, owner, dbRootSeed, feedSeed, FEED_LABEL, FEED_COLUMNS, FEED_ID_COL, [], undefined, []);
  console.log("feed table created", feedTablePda.toBase58(), sig);
} else console.log("feed table exists", feedTablePda.toBase58());
