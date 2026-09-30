// evm.js - the HOOD IN chain adapter (Robinhood Chain, an Arbitrum Orbit L2).
// Same window.iqCodein surface as browser.js (solana) so the one page module
// drives both boards; registered under window.iqCodeinChains.evm and loaded on
// demand by the page when the route is ?menu=hoodin.
//
// Model B hybrid signing: a deterministic browser BURNER signs the big-calldata
// chunk txs + the shared board row (dbCodeIn) through the public RPC, so those
// never reach the wallet UI (no "unsimulatable / risky" warning, no per-batch
// popups, and they sidestep the wallet's flaky proxy RPC). The USER WALLET signs
// only the small native-inventory finalize (userInventoryCodeIn + tail bump),
// which simulates cleanly. Both reference the same uploaded chunks, and `who`
// (inside the row) keeps board attribution to the user. So the user signs ~3
// clean txs regardless of file size, not one per batch. Needs sdk >= 0.4.3
// (writeRowWithInventory). The official public RPC is CORS-open + unthrottled.
import { toAscii } from "./ascii.js?v=1";
import { BrowserProvider, JsonRpcProvider, Wallet, formatEther, parseEther, keccak256, toUtf8Bytes } from "https://cdn.jsdelivr.net/npm/ethers@6.17.0/+esm";
import * as sdk from "https://cdn.jsdelivr.net/npm/@iqlabs-official/ethereum-sdk@0.4.3/+esm";

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
let burnerWallet = null; // deterministic Model B burner, derived once per session from a wallet signature
let inscribeCheckpoint = null; // { row, at: HybridCheckpoint } - survives across RETRY for the same row
const BURNER_MSG = "IQ6900 hood-in inscription burner v1"; // fixed message = deterministic burner derivation

// EIP-6963 multi-wallet discovery. Brave injects its own window.ethereum and
// claims the generic slot, hiding Phantom/MetaMask so a raw window.ethereum read
// connects to the wrong wallet (or fails on Robinhood). Collect every wallet
// that announces itself, then pick the best match at connect time.
const eip6963 = {};
if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", (e) => {
    const d = e && e.detail;
    if (d && d.info && d.info.rdns && d.provider) eip6963[d.info.rdns] = d;
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}
function getEth() {
  const by = (rdns) => eip6963[rdns] && eip6963[rdns].provider;
  const announced = Object.values(eip6963);
  // Phantom first (hood users use it for Robinhood), then MetaMask, then any
  // announced wallet that is not Brave's built-in, then anything announced,
  // then the raw slot as a last resort.
  return by("app.phantom") || by("io.metamask")
    || (announced.find((d) => d.info.rdns !== "com.brave.wallet") || {}).provider
    || (announced[0] || {}).provider
    || (typeof window !== "undefined" ? window.ethereum : null) || null;
}
async function discoverEth() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("eip6963:requestProvider"));
  if (!Object.keys(eip6963).length) await new Promise((r) => setTimeout(r, 250));
  return getEth();
}

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
// chunk chain entirely; larger ones batch 850-char chunks under the SDK's
// 80 KB payload budget (96 chunks/batch, keeping encoded calldata ~87 KB
// under the Robinhood sequencer's oversized-data ceiling), then dbCodeIn +
// tail = 2. Must track ethereum-sdk networks.ts maxBatchPayloadBytes.
const BATCH_CHARS = 850 * 96;
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

// Derive the Model B burner once per session: sign a fixed message with the
// wallet (deterministic for an EOA, so re-deriving hits the same key across
// sessions and its funded balance/leftover is reused), hash the signature into
// a 32-byte private key, and wire it to the PUBLIC rpc so its txs never touch
// the wallet. Message signing shows a clean "sign message" prompt, no warning.
async function getBurner() {
  if (burnerWallet) return burnerWallet;
  if (!signer) throw new Error("connect the wallet first");
  const sig = await signer.signMessage(BURNER_MSG);
  burnerWallet = new Wallet(keccak256(toUtf8Bytes(sig)), new JsonRpcProvider(activeRpc));
  return burnerWallet;
}

// Top the burner up to cover the board fee (it pays that) + gas for the chunk
// txs + dbCodeIn + tail. Gas on Robinhood is sub-cent, so a generous per-tx
// buffer stays tiny and any excess is swept back. The USER pays the inventory
// fee on their own userInventoryCodeIn tx, so it is not funded here. A funded
// deterministic burner is reused, so later inscriptions usually skip this.
async function fundBurner(burner, rowLen) {
  const boardFeeEth = rowLen <= 700 ? fees.basic : fees.linked;
  // Generous flat gas buffer per tx: robinhood gas is sub-cent so this is tiny
  // in ETH, and any excess is swept back - over-funding is cheap, running the
  // burner dry mid-upload is not. NOT scaled up on retry (a resume needs LESS,
  // and the burner keeps whatever the first attempt funded), so have>=need
  // tops up only the real shortfall.
  const need = parseEther((boardFeeEth + 0.0005 * sigsFor(rowLen)).toFixed(9));
  const have = await burner.provider.getBalance(burner.address);
  if (have >= need) return;
  const topUp = need - have;
  // Pre-flight the wallet balance so a drained wallet gets a clear message
  // instead of a cryptic RPC "insufficient funds" mid-retry.
  const walletBal = await signer.provider.getBalance(await signer.getAddress());
  if (walletBal <= topUp) {
    throw new Error("not enough ETH in your wallet to start the write (need ~"
      + Number(formatEther(topUp)).toFixed(5) + " ETH, most of it comes back). add ETH and retry.");
  }
  const tx = await signer.sendTransaction({ to: burner.address, value: topUp });
  await tx.wait();
}

// Return the burner's leftover to the wallet after a write (best-effort; a
// deterministic burner means any stranded dust is recoverable on the next run).
async function sweepBurner(burner, to) {
  try {
    const bal = await burner.provider.getBalance(burner.address);
    const gp = (await burner.provider.getFeeData()).gasPrice || 100000000n;
    const cost = gp * 21000n * 2n;
    if (bal > cost) { const tx = await burner.sendTransaction({ to, value: bal - cost }); await tx.wait(); }
  } catch (e) { /* best-effort */ }
}

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
    const eth = await discoverEth();
    if (!eth) throw new Error("no EVM wallet found. install Phantom or MetaMask.");
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
    burnerWallet = null; // a (re)connect may be a different wallet; re-derive the burner lazily
    return signer.address;
  },

  // Health check for the wallet-side RPC (the one that will broadcast).
  // eth_blockNumber through window.ethereum uses the RPC the WALLET has saved
  // for chain 4663, which we cannot read or change programmatically; a dead
  // chainlist entry (rpc.arrowrpc.com was down 2026-09) fails every send with
  // -32603, so catch it BEFORE the user signs anything.
  checkWalletRpc: async () => {
    const eth = getEth();
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
  // With the Model B burner the WALLET only signs ~3 clean txs (fund + the two
  // native-inventory finalize txs) no matter how many chunks, so sigs is fixed
  // and the old per-batch popup budget/cap never trips. total shows the on-chain
  // fee: board + inventory are charged separately, so it is 2x the base fee
  // (gas on an Orbit chain is sub-cent, folded into "+ gas").
  estimateCost: (bytes) => {
    const batches = Math.max(0, sigsFor(bytes) - 2); // burner-signed chunk batches
    const fee = (bytes <= 700 ? fees.basic : fees.linked) * 2; // dbCodeIn (board) + userInventoryCodeIn
    return {
      sigs: 3,
      chunks: batches,
      totalLabel: fee.toFixed(5) + " ETH + gas",
      sigsLabel: "3 wallet signatures (burner uploads " + batches + " batch" + (batches === 1 ? "" : "es") + ")",
    };
  },

  // Model B hybrid write (sdk 0.4.3 writeRowWithInventory): derive the burner
  // (one clean message-sign), fund it (one plain transfer the wallet simulates
  // fine), then the burner uploads the chunks + writes the board row while the
  // user signs only the small native-inventory finalize. onProgress maps onto
  // the gauge (burner chunk upload). On a stall the SDK throws HybridInterrupted
  // with a phase checkpoint; keeping it keyed to the exact row lets RETRY resume
  // (skipping already-landed chunks/fees) instead of redoing everything. Returns
  // the board row's tx (boardTx) as sig, which is what the feed/UI keys on.
  inscribe: async ({ kind, body, who, onProgress }) => {
    if (!signer) throw new Error("connect the wallet first");
    const row = JSON.stringify({ kind, body, who });
    const burner = await getBurner();
    const resume = inscribeCheckpoint && inscribeCheckpoint.row === row ? inscribeCheckpoint.at : undefined;
    await fundBurner(burner, row.length);
    try {
      const out = await sdk.writer.writeRowWithInventory(
        burner, signer, DB_ROOT_ID, TABLE, row,
        { filename: kind, filetype: "text/plain", onProgress: (pct) => onProgress && onProgress(pct), resume },
      );
      inscribeCheckpoint = null;
      sweepBurner(burner, signer.address); // fire-and-forget return of leftover
      return { sig: out.boardTx };
    } catch (e) {
      if (e && e.checkpoint) inscribeCheckpoint = { row, at: e.checkpoint };
      throw e;
    }
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

  // Gateway views of a post, network-tagged so the resolver reads Robinhood
  // txs. The path carries the tx hash itself, so the pointer outlives us.
  imgUrl: (hash) => GATEWAYS[0] + "/img/" + hash + ".png?" + NET,
  renderUrl: (hash) => GATEWAYS[0] + "/render/" + hash + "?" + NET,

  // Same market interface as the solana adapter, sourced from GeckoTerminal
  // (DexScreener does not index Robinhood chain; GeckoTerminal has a native
  // `robinhood` network). It indexes graduated DEX pools (uniswap/giga/etc), so
  // a pons coin still on its bonding curve has no pool yet and is simply absent
  // (the panel shows it as "new" with a link to pons until it graduates).
  market: {
    attribution: "via geckoterminal",
    tradeLabel: "VIEW ON PONS",
    tradeShort: "Pons",
    tradeName: "pons",
    siteLabel: "OPEN ON GECKOTERMINAL",
    tradeUrl: (mint) => "https://www.ponsfamily.com/launchpad/" + mint,
    embedUrl: (pair) => "https://www.geckoterminal.com/robinhood/pools/" + pair.pairAddress + "?embed=1&info=0&swaps=0&light_chart=0",
    siteUrl: (pair) => pair.url || ("https://www.geckoterminal.com/robinhood/pools/" + pair.pairAddress),
    enrich: async (mints) => {
      const out = [];
      for (let i = 0; i < mints.length; i += 30) {
        const batch = mints.slice(i, i + 30); // GeckoTerminal tokens/multi caps at 30
        try {
          const res = await fetch("https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/multi/"
            + batch.join(",") + "?include=top_pools", { headers: { Accept: "application/json" } });
          if (!res.ok) continue;
          const j = await res.json();
          const pools = {};
          (j.included || []).forEach((p) => { pools[p.id] = p.attributes || {}; });
          (j.data || []).forEach((tok) => {
            const a = tok.attributes || {};
            const gm = (a.address || "").toLowerCase();
            const mint = batch.find((m) => m.toLowerCase() === gm); // map back to the caller's casing
            if (!mint) return;
            const rel = ((tok.relationships || {}).top_pools || {}).data || [];
            const pool = rel.length ? pools[rel[0].id] : null;
            if (!pool || !pool.address) return; // no DEX pool yet (still on the pons curve)
            const pc = pool.price_change_percentage || {};
            const vol = pool.volume_usd || {};
            out.push({ mint: mint, liq: Number(pool.reserve_in_usd) || 0, pairAddress: pool.address,
              url: "https://www.geckoterminal.com/robinhood/pools/" + pool.address,
              priceUsd: a.price_usd, chg24: pc.h24 != null ? Number(pc.h24) : null,
              mcap: Number(a.market_cap_usd || a.fdv_usd) || null,
              vol24: Number(vol.h24) || null, icon: a.image_url || null });
          });
        } catch (e) { /* leave this batch out */ }
      }
      return out;
    },
  },

  // The pons launcher signs with the same wallet session this adapter holds.
  get signer() { return signer; },

  toAscii,

  // Warm the durable index after a landed write. This is not just a cache hint
  // on robinhood: without it the first feed read cold-walks the chain (~15s,
  // uncached), so a fresh post can be invisible for minutes. The warm itself
  // cold-walks too, so the timeout must outlast that walk; 4s aborted it before
  // the gateway finished indexing, leaving the row unwarmed.
  notify: async (hash, row) => {
    const body = JSON.stringify({ txSignature: hash, txHash: hash, row });
    for (const gw of GATEWAYS) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 30000);
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
