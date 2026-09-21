// browser.js — the bridge between the ESM core (SDK-backed) and the site's
// classic jQuery page module. It exposes a small window.iqCodein surface and
// fires "iqcodein:ready". The process shim is set by a classic <script> in
// index.html before this module evaluates, because the SDK reads process.env
// at load. The SDK and web3.js resolve through the page's <script type=importmap>.
import { Connection, PublicKey } from "@solana/web3.js";
import { setRpcUrl, reader, contract } from "@iqlabs-official/solana-sdk";
import { deriveBurner } from "./burner.js";
import { estimateCost } from "./cost.js";
import { inscribe } from "./inscribe.js";
import { feedTablePda, programId } from "./feed.js";

// Branch default: the feed lives on devnet. Swap to the gateway/mainnet at release.
const DEFAULT_RPC = "https://api.devnet.solana.com";
setRpcUrl(DEFAULT_RPC);

// light for a public RPC (429-safe to ~32KB); medium once the user brings their own.
export const recommendSpeed = (isOwnRpc) => (isOwnRpc ? "medium" : "light");

window.iqCodein = {
  connect: (rpc) => new Connection(rpc || DEFAULT_RPC, "confirmed"),
  setRpc: (rpc) => setRpcUrl(rpc || DEFAULT_RPC),
  deriveBurner,
  estimateCost,
  inscribe,
  recommendSpeed,
  feedTable: feedTablePda.toBase58(),
  userInventory: (pubkey) => contract.getUserInventoryPda(new PublicKey(pubkey), programId).toBase58(),
  readRows: (account, limit = 24) => reader.readTableRows(account, { limit }),
};
window.dispatchEvent(new Event("iqcodein:ready"));
