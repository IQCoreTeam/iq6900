// evm.js - the HOOD IN chain adapter (Robinhood Chain, an Arbitrum Orbit L2).
// Same window.iqCodein surface as browser.js (solana) so the one page module
// drives both boards; registered under window.iqCodeinChains.evm and loaded on
// demand by the page when the route is ?menu=hoodin.
//
// Model A signing (issue #3): the USER WALLET signs every tx sequentially, no
// burner. writeRow = N linked-list batch txs + 2 (dbCodeIn + tail update); the
// wallet broadcasts through its own RPC, so this module's RPC only serves
// reads (fees, gateway fallbacks). The official public RPC is CORS-open and
// unthrottled (verified), unlike Solana's public mainnet.
import { toAscii } from "./ascii.js?v=1";
import { BrowserProvider, JsonRpcProvider, formatEther } from "https://cdn.jsdelivr.net/npm/ethers@6.17.0/+esm";
import * as sdk from "https://cdn.jsdelivr.net/npm/@iqlabs-official/ethereum-sdk@0.4.0/+esm";

const DB_ROOT_ID = "iq6900-codein-feed-v1"; // same labels as the Solana feed (feed.js)
const TABLE = "global-feed";
const CHAIN_ID = "0x1237"; // 4663
const DEFAULT_RPC = "https://rpc.mainnet.chain.robinhood.com";
const EXPLORER_TX = "https://robinhoodchain.blockscout.com/tx/";
const RPC_KEY = "iq6900_rpc_robinhood";
const GATEWAYS = ["https://gateway.iqlabs.dev"];
const NET = "network=robinhood";

let activeRpc = DEFAULT_RPC;
try { const saved = localStorage.getItem(RPC_KEY); if (saved) activeRpc = saved; } catch (e) {}
sdk.setNetwork("robinhood", activeRpc);

let provider = null; // BrowserProvider over the injected wallet
let signer = null;

async function gwFetch(path, init) {
  for (const gw of GATEWAYS) {
    try { const res = await fetch(gw + path, init); if (res.ok || res.status === 404) return res; } catch (e) {}
  }
  throw new Error("all gateways unreachable");
}

// Rows come back with __txHash; the UI keys everything on __txSignature
// (solana naming), so mirror the field instead of forking the renderer.
const normRows = (rows) => (Array.isArray(rows) ? rows : []).map((r) => (
  r && r.__txHash && !r.__txSignature ? Object.assign({ __txSignature: r.__txHash }, r) : r
));

// writeRow tx count: payloads at or under the 700 B inline budget skip the
// chunk chain entirely; larger ones batch 850-char chunks into ~95 KB sendCode
// txs (111 chunks/batch, partner-measured budget), then dbCodeIn + tail = 2.
const BATCH_CHARS = 850 * 111;
const sigsFor = (len) => (len <= 700 ? 2 : Math.ceil(len / BATCH_CHARS) + 2);

// Contract fees, cached for the sync estimator; refreshed once in background.
// Fallbacks are the mainnet values measured at feed setup (2026-09-23).
const fees = { basic: 0.00012, linked: 0.00036, loaded: false };
(async () => {
  try {
    const p = new JsonRpcProvider(DEFAULT_RPC);
    const [b, l] = await Promise.all([sdk.utils.getBasicFee(p), sdk.utils.getLinkedListFee(p)]);
    fees.basic = Number(formatEther(b)); fees.linked = Number(formatEther(l)); fees.loaded = true;
  } catch (e) { /* keep fallbacks */ }
})();

const surface = {
  meta: {
    chain: "evm",
    menu: "hoodin",
    unit: "ETH",
    walletName: "MetaMask",
    boardTitle: "board.exe · robinhood",
    connLabel: "connection: robinhood public rpc",
    scanLabel: "EXPLORER",
    maxSigs: 25, // default popup budget; over it the cap modal offers SDK or continue-anyway
  },

  // The wallet is the signer AND the broadcaster; connect = request accounts,
  // make sure the wallet is on Robinhood Chain (add it if unknown), grab a signer.
  connectWallet: async () => {
    const eth = window.ethereum;
    if (!eth) throw new Error("no EVM wallet found. install MetaMask.");
    await eth.request({ method: "eth_requestAccounts" });
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID }] });
    } catch (err) {
      if (err && (err.code === 4902 || /unrecognized|not added/i.test(String(err.message)))) {
        await eth.request({ method: "wallet_addEthereumChain", params: [{
          chainId: CHAIN_ID, chainName: "Robinhood Chain",
          rpcUrls: [DEFAULT_RPC], nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
        }] });
      } else throw err;
    }
    provider = new BrowserProvider(eth);
    signer = await provider.getSigner();
    return signer.address;
  },

  // Health check for the wallet-side RPC (the one that will broadcast).
  // eth_blockNumber through window.ethereum uses the RPC the WALLET has saved
  // for chain 4663, which we cannot read or change programmatically; a dead
  // chainlist entry (rpc.arrowrpc.com was down 2026-09) fails every send with
  // -32603, so catch it BEFORE the user signs anything.
  checkWalletRpc: async () => {
    const eth = window.ethereum;
    if (!eth) return { ok: false, reason: "no wallet" };
    const timed = (p, ms) => Promise.race([p, new Promise((_, rj) => setTimeout(() => rj(new Error("timeout")), ms))]);
    let walletBlock;
    try { walletBlock = parseInt(await timed(eth.request({ method: "eth_blockNumber" }), 6000), 16); }
    catch (err) { return { ok: false, reason: "not responding" }; }
    if (!Number.isFinite(walletBlock)) return { ok: false, reason: "not responding" };
    try {
      const chainBlock = await timed(new JsonRpcProvider(DEFAULT_RPC).getBlockNumber(), 6000);
      if (chainBlock - walletBlock > 600) return { ok: false, reason: (chainBlock - walletBlock) + " blocks behind" };
    } catch (err) { /* official rpc hiccup; do not blame the wallet */ }
    return { ok: true };
  },

  setRpc: (rpc) => {
    activeRpc = rpc || DEFAULT_RPC;
    try { rpc ? localStorage.setItem(RPC_KEY, rpc) : localStorage.removeItem(RPC_KEY); } catch (e) {}
    sdk.setNetwork("robinhood", activeRpc);
  },
  hasOwnRpc: () => activeRpc !== DEFAULT_RPC,

  // Sync, like the solana estimator; fees refresh in the background above.
  // sigs is what the popup budget is measured in; total shows the on-chain fee
  // (gas on an Orbit chain is fractions of a cent, folded into "+ gas").
  estimateCost: (bytes) => {
    const sigs = sigsFor(bytes);
    const fee = bytes <= 700 ? fees.basic : fees.linked;
    return {
      sigs,
      chunks: Math.max(0, sigs - 2),
      totalLabel: fee.toFixed(5) + " ETH + gas",
      sigsLabel: sigs + (sigs === 2 ? " signatures" : " signatures, sequential"),
    };
  },

  // Model A write: the user's wallet signs each tx as writeRow walks the
  // linked list. onProgress maps straight onto the existing gauge; the i/N
  // signature label derives from pct (batches sign in order).
  inscribe: async ({ kind, body, who, onProgress }) => {
    if (!signer) throw new Error("connect the wallet first");
    const row = JSON.stringify({ kind, body, who });
    const hash = await sdk.writer.writeRow(signer, DB_ROOT_ID, TABLE, row, (pct) => onProgress && onProgress(pct));
    return { sig: hash };
  },

  feedTable: DB_ROOT_ID + "/" + TABLE,

  readBoard: async (limit = 24, before) => {
    let path = `/table/${DB_ROOT_ID}/${TABLE}/rows?${NET}&limit=${limit}`;
    if (before) path += `&before=${before}`;
    const res = await gwFetch(path);
    if (res.status === 404) return { rows: [], nextCursor: null };
    const data = await res.json();
    return { rows: normRows(data && data.rows), nextCursor: (data && data.nextCursor) || null };
  },

  // writeRow does not touch the per-user codeIn chain on EVM (measured: the
  // gateway /user/assets only lists codeIn uploads), so "my inventory" is the
  // feed filtered by the who column, paged a few cursors deep.
  readMine: async (addr, limit = 24) => {
    const me = String(addr || "").toLowerCase();
    const out = []; let cursor = null;
    for (let i = 0; i < 5; i++) {
      const page = await surface.readBoard(50, cursor);
      out.push(...page.rows.filter((r) => String(r.who || "").toLowerCase() === me));
      cursor = page.nextCursor;
      if (!cursor || out.length >= limit) break;
    }
    return { rows: out.slice(0, limit), nextCursor: null };
  },

  readOne: async (hash) => {
    const res = await gwFetch(`/table/${DB_ROOT_ID}/${TABLE}/slice?sigs=${hash}&${NET}`);
    if (!res.ok) return null;
    const d = await res.json();
    return normRows(d.rows)[0] || null;
  },

  viewUrl: (hash) => {
    const url = new URL(window.location.pathname, window.location.origin);
    url.searchParams.set("menu", "hoodin");
    url.searchParams.set("post", hash);
    return url.href;
  },
  solscanUrl: (hash) => EXPLORER_TX + hash, // same surface name; Blockscout target

  toAscii,

  // Best-effort cache hint after a landed write, mirroring the solana flow.
  notify: async (hash, row) => {
    const body = JSON.stringify({ txSignature: hash, txHash: hash, row });
    for (const gw of GATEWAYS) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      try {
        const res = await fetch(`${gw}/table/${DB_ROOT_ID}/${TABLE}/notify?${NET}`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body, signal: ctrl.signal,
        });
        if (res.ok) return true;
      } catch (e) {} finally { clearTimeout(t); }
    }
    return false;
  },
};

window.iqCodeinChains = Object.assign(window.iqCodeinChains || {}, { evm: surface });
