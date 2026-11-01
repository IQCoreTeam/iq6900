// nft_bridge.js - the classic<->ESM bridge for the inscription NFT launchpad.
// Exposes window.iqNft and fires "iqnft:ready". The page module nft_launch.js
// (?menu=nft) is classic jQuery and drives everything through this surface.
// Wallet + burner material stays in this module; the page only sees pubkeys.
// SDK + web3 resolve through index.html's importmap, same as browser.js.
import { Connection, PublicKey } from "@solana/web3.js";
import { setRpcUrl } from "@iqlabs-official/solana-sdk";
import { deriveBurner } from "./burner.js";
import { listWallets, connectWallet, getWalletProvider, disconnectWallet } from "./wallets.js?v=1";
import * as nft from "./nft.js?v=9";
import { deploy, pendingDeploy } from "./nft_create.js?v=8";
import { compressImage } from "./image_compress.js?v=1";
import { readAsset, readInscription, viewAssetViaGateway, gatewayMetadata } from "./nft_asset.js?v=4";
import { preset, net, setNet } from "./nft_net.js?v=2";

// The NFT program + backend run on their own network (see nft_net.js), which may
// differ from the rest of the site, so the NFT page keeps its own RPC under its
// own localStorage key. To switch networks, flip NET_DEFAULT in nft_net.js; the
// RPC, backend, gateway and explorer all move together.
const RPC_KEY = "iq6900_nft_rpc";
function rpc() { try { return localStorage.getItem(RPC_KEY) || preset().rpc; } catch (e) { return preset().rpc; } }
function connection() { return new Connection(rpc(), "confirmed"); }
// The gateway that serves /img and /token-meta for this cluster (matches the
// backend's config.gatewayBase). From the preset, so it can never desync from
// the cluster even if a same-network custom RPC is set.
function gatewayBase() { return preset().gateway; }

// Wallet: any Solana wallet the site discovers (wallets.js: Wallet Standard
// wallets such as Jupiter or MetaMask, plus Phantom/Backpack), connected on
// the NFT cluster. Nothing prompts on entry: restore() only reconnects a
// wallet that approved this site before, connect() runs from the button.
function active() { return getWalletProvider(); }
async function ensureConnected(walletId) {
  const p = active();
  if (p && p.publicKey) return p;
  await connectWallet({ walletId, cluster: net() });
  return getWalletProvider();
}
// The burner is derived from one wallet signature, so deriving it is a wallet
// popup. It happens only when the user acts (mint, deploy); never on page entry.
// Its public key is remembered per wallet (public data), so a returning user's
// cost estimate can read the burner's account rent without any popup.
const BURNER_KEY = (wallet) => "iq6900_nft_burner_" + wallet;
async function burnerFor(provider) {
  // Same derivation as the code-in page: one signMessage, raw signature bytes out.
  const signMessage = async (msg) => {
    const out = await provider.signMessage(msg instanceof Uint8Array ? msg : new TextEncoder().encode(msg), "utf8");
    return out.signature || out;
  };
  const burner = await deriveBurner(signMessage);
  try { localStorage.setItem(BURNER_KEY(provider.publicKey.toBase58()), burner.publicKey.toBase58()); } catch (e) {}
  return burner;
}
function knownBurner(provider) {
  try { const b = localStorage.getItem(BURNER_KEY(provider.publicKey.toBase58())); return b ? { publicKey: new PublicKey(b) } : null; } catch (e) { return null; }
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
  solscanTx: (sig) => `https://solscan.io/tx/${sig}${preset().explorerCluster}`,
  // cluster suffix + gateway host, so the page (nft_launch.js) builds explorer
  // links and host labels from the same single source instead of re-sniffing.
  explorerCluster: () => preset().explorerCluster,
  gatewayHost: () => preset().gateway.replace(/^https?:\/\//, ""),
  net,
  setNet,
  // the gateway's own hosted viewer page for an inscription (renders the content
  // from chain); cluster-matched so devnet sigs resolve on the devnet gateway
  viewUrl: (sig) => gatewayBase() + "/view/" + sig,
  imgUrl: (sig) => gatewayBase() + "/img/" + sig + ".png", // the gateway render of an image inscription
  metaUrl: (M) => gatewayBase() + "/token-meta/" + M, // the asset uri we register
  gatewayMeta: (M) => gatewayMetadata(gatewayBase(), M),
  // {id, name, icon, selected} per discovered wallet; connect(id) picks one,
  // connect() takes the saved or only wallet and throws "Choose a Solana wallet
  // first." when it is ambiguous (the page then shows its picker).
  wallets: () => listWallets(net()).map(({ id, name, icon, provider }) => ({ id, name, icon, selected: provider === getWalletProvider() })),
  connect: async (walletId) => (await ensureConnected(walletId)).publicKey.toBase58(),
  restore: () => connectWallet({ onlyIfTrusted: true, cluster: net() }),
  disconnect: disconnectWallet,
  connected: () => { const p = active(); return p && p.publicKey ? p.publicKey.toBase58() : null; },
  // Silent: uses the remembered burner key when there is one, never signs.
  estimateMintCost: async (col) => {
    try { const p = active(), b = p && p.publicKey && knownBurner(p); return b ? nft.estimateMintCost(col, connection(), b) : nft.estimateMintCost(col); }
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
