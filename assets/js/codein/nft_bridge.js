// nft_bridge.js - the classic<->ESM bridge for the inscription NFT launchpad.
// Exposes window.iqNft and fires "iqnft:ready". The page module nft_launch.js
// (?menu=nft) is classic jQuery and drives everything through this surface.
// Wallet + burner material stays in this module; the page only sees pubkeys.
// SDK + web3 resolve through index.html's importmap, same as browser.js.
import { Connection } from "@solana/web3.js";
import { setRpcUrl } from "@iqlabs-official/solana-sdk";
import { deriveBurner } from "./burner.js";
import * as nft from "./nft.js";

// The NFT program + backend currently run on DEVNET while the rest of the site
// is mainnet, so the NFT page keeps its own RPC under its own localStorage key.
// Flip RPC_DEFAULT (and the backend) to mainnet at go-live.
const RPC_DEFAULT = "https://api.devnet.solana.com";
const RPC_KEY = "iq6900_nft_rpc";
function rpc() { try { return localStorage.getItem(RPC_KEY) || RPC_DEFAULT; } catch (e) { return RPC_DEFAULT; } }
function connection() { return new Connection(rpc(), "confirmed"); }

function phantom() {
  const p = (window.phantom && window.phantom.solana) || window.solana || null;
  if (!p) throw new Error("No Solana wallet found. Install Phantom and reload.");
  return p;
}
async function ensureConnected() {
  const p = phantom();
  if (!p.publicKey) await p.connect();
  return p;
}
async function burnerFor(provider) {
  // Same derivation as the code-in page: one signMessage, raw signature bytes out.
  const signMessage = async (msg) => {
    const out = await provider.signMessage(msg instanceof Uint8Array ? msg : new TextEncoder().encode(msg), "utf8");
    return out.signature || out;
  };
  return deriveBurner(signMessage);
}

window.iqNft = {
  setApi: nft.setNftApi,
  api: nft.nftApi,
  setRpc: (u) => { try { u ? localStorage.setItem(RPC_KEY, u) : localStorage.removeItem(RPC_KEY); } catch (e) {} },
  getRpc: rpc,
  health: async () => { try { const r = await fetch(nft.nftApi() + "/health"); return await r.json(); } catch (e) { return { ok: false, error: String(e) }; } },
  getCollections: nft.getCollections,
  getCollection: nft.getCollection,
  getItems: nft.getItems,
  getRecent: nft.getRecent,
  pendingMint: nft.pendingMint,
  solscanTx: (sig) => `https://solscan.io/tx/${sig}${rpc().indexOf("devnet") >= 0 ? "?cluster=devnet" : ""}`,
  // Connect the wallet, return its address (for the connect button).
  connect: async () => (await ensureConnected()).publicKey.toBase58(),
  connected: () => { try { return phantom().publicKey ? phantom().publicKey.toBase58() : null; } catch (e) { return null; } },
  // Best-effort funding estimate (lamports) to show before the popup.
  estimateCost: async (col) => {
    try {
      const p = phantom();
      if (!p.publicKey) return await nft.estimateMintCost(col);
      return await nft.estimateMintCost(col, connection(), await burnerFor(p));
    } catch (e) { return await nft.estimateMintCost(col); }
  },
  // The whole buyer mint. onStage(stage, extra), onProgress(pct, label) for the C upload.
  mint: async ({ slug, collection, onStage, onProgress }) => {
    const provider = await ensureConnected();
    const conn = connection();
    setRpcUrl(rpc()); // SDK global RPC; point it at the NFT cluster for this write
    const burner = await burnerFor(provider);
    return nft.mint({ connection: conn, wallet: provider, burner, slug, collection, onStage, onProgress });
  },
};
window.iqNftReady = true;
window.dispatchEvent(new Event("iqnft:ready"));
