// feed.js - the single source of truth for the global feed's on-chain identity.
// Every surface (board reads, inscribe writes, the one-time setup) derives its
// PDAs from here, so the feed can never drift between callers.
import { contract, utils } from "@iqlabs-official/solana-sdk";

export const DB_ROOT_LABEL = "iq6900-codein-feed-v1";
export const FEED_LABEL = "global-feed";
export const FEED_COLUMNS = ["kind", "body", "who"];
export const FEED_ID_COL = "who";

export const programId = contract.createInstructionBuilder().programId;
export const dbRootSeed = utils.toSeedBytes(DB_ROOT_LABEL);
export const feedSeed = utils.toSeedBytes(FEED_LABEL);
export const dbRootPda = contract.getDbRootPda(dbRootSeed, programId);
export const feedTablePda = contract.getTablePda(dbRootPda, feedSeed, programId);
