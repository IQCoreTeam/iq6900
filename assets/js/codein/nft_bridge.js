// nft_bridge.js - the classic<->ESM bridge for the inscription NFT launchpad.
// Exposes window.iqNft and fires "iqnft:ready". The page module nft_launch.js
// (?menu=nft) is classic jQuery and drives everything through this surface.
// Wallet + burner material stays in this module; the page only sees pubkeys.
// SDK + web3 resolve through index.html's importmap, same as browser.js.
import { Connection } from "@solana/web3.js";
import { setRpcUrl } from "@iqlabs-official/solana-sdk";
import { deriveBurner } from "./burner.js";
import * as nft from "./nft.js?v=5";
import { deploy, pendingDeploy } from "./nft_create.js?v=3";
import { compressImage } from "./image_compress.js?v=1";
import { readAsset, readInscription, viewAssetViaGateway, gatewayMetadata } from "./nft_asset.js?v=4";

// The NFT program + backend currently run on DEVNET while the rest of the site
// is mainnet, so the NFT page keeps its own RPC under its own localStorage key.
// Flip RPC_DEFAULT (and the backend) to mainnet at go-live.
const RPC_DEFAULT = "https://api.devnet.solana.com";
const RPC_KEY = "iq6900_nft_rpc";
function rpc() { try { return localStorage.getItem(RPC_KEY) || RPC_DEFAULT; } catch (e) { return RPC_DEFAULT; } }
function connection() { return new Connection(rpc(), "confirmed"); }
// The gateway that serves /img and /token-meta for this cluster (matches the
// backend's config.gatewayBase); used when the client builds a single NFT's M.
function gatewayBase() { return rpc().indexOf("devnet") >= 0 ? "https://dev-gateway.iqlabs.dev" : "https://gateway.iqlabs.dev"; }

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

// The page calls nft.js's reads/helpers under their real names across the
// ESM->window boundary (it is a classic script and cannot import), so the whole
// module is re-exposed by spread. Only the entries that need a wallet, an RPC,
// or the backend host are defined here; `mint` and `estimateMintCost` override
// the engine's pure versions by supplying the browser's connection/wallet/burner.
window.iqNft = Object.assign({}, nft, {
  getRpc: rpc,
  setRpc: (u) => { try { u ? localStorage.setItem(RPC_KEY, u) : localStorage.removeItem(RPC_KEY); } catch (e) {} },
  health: async () => { try { return await (await fetch(nft.nftApi() + "/health")).json(); } catch (e) { return { ok: false, error: String(e) }; } },
  solscanTx: (sig) => `https://solscan.io/tx/${sig}${rpc().indexOf("devnet") >= 0 ? "?cluster=devnet" : ""}`,
  imgUrl: (sig) => gatewayBase() + "/img/" + sig + ".png", // the gateway render of an image inscription
  metaUrl: (M) => gatewayBase() + "/token-meta/" + M, // the asset uri we register
  gatewayMeta: (M) => gatewayMetadata(gatewayBase(), M),
  connect: async () => (await ensureConnected()).publicKey.toBase58(),
  connected: () => { try { return phantom().publicKey ? phantom().publicKey.toBase58() : null; } catch (e) { return null; } },
  estimateMintCost: async (col) => {
    try { const p = phantom(); return p.publicKey ? nft.estimateMintCost(col, connection(), await burnerFor(p)) : nft.estimateMintCost(col); }
    catch (e) { return nft.estimateMintCost(col); }
  },
  mint: async ({ slug, collection, onStage, onProgress }) => {
    const provider = await ensureConnected();
    setRpcUrl(rpc()); // SDK global RPC; point it at the NFT cluster for this write
    return nft.mint({ connection: connection(), wallet: provider, burner: await burnerFor(provider), slug, collection, onStage, onProgress });
  },
  // Creator deploy: same wallet/burner wiring as mint. compressImage is exposed
  // so the creator page can preview a compressed size before deploying.
  deploy: async ({ spec, items, onStage }) => {
    const provider = await ensureConnected();
    setRpcUrl(rpc());
    return deploy({ connection: connection(), wallet: provider, burner: await burnerFor(provider), spec, items, onStage });
  },
  pendingDeploy,
  compressImage,
  // On-chain NFT viewer: reads an asset entirely from the chain (no backend).
  // setRpcUrl points the SDK reader's linked-list/session walk at this cluster.
  // Default viewer path: account from chain + metadata/image from the gateway cache.
  viewAsset: async (asset) => viewAssetViaGateway(connection(), gatewayBase(), asset),
  // The proof path: everything decoded from chain by the browser, no gateway.
  recoverAsset: async (asset, onStep) => { setRpcUrl(rpc()); return readAsset(connection(), asset, onStep); },
  // Read one inscription feed row {kind, body, who} from chain (single-NFT view
  // uses it to show the content and confirm the connected wallet owns it).
  readRow: async (sig) => { setRpcUrl(rpc()); return JSON.parse(await readInscription(connection(), sig)); },
  // Single NFT: turn the user's existing inscription C into a 1/1.
  mintSingle: async ({ C, name, kind, onStage }) => {
    const provider = await ensureConnected();
    setRpcUrl(rpc());
    return nft.mintSingle({ connection: connection(), wallet: provider, burner: await burnerFor(provider), gatewayBase: gatewayBase(), C, name, kind, onStage });
  },
});
window.iqNftReady = true;
window.dispatchEvent(new Event("iqnft:ready"));
