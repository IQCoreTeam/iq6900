// browser.js - the bridge between the ESM core (SDK-backed) and the site's
// classic jQuery page module. It exposes a small window.iqCodein surface and
// fires "iqcodein:ready". The process shim is set by a classic <script> in
// index.html before this module evaluates, because the SDK reads process.env
// at load. The SDK and web3.js resolve through the page's <script type=importmap>.
import { Connection, PublicKey } from "@solana/web3.js";
import { setRpcUrl, reader, contract } from "@iqlabs-official/solana-sdk";
import { deriveBurner } from "./burner.js";
import { estimateCost } from "./cost.js?v=3";
import { inscribe, sweep } from "./inscribe.js?v=5";
import { feedTablePda, programId } from "./feed.js";

// Live default write RPC. NOTE: api.mainnet-beta.solana.com 403s every browser
// request (it blocks any call carrying an Origin header), so it cannot be the
// default for a client that writes. publicnode is a free, keyless, CORS-open
// mainnet endpoint (ACAO:*) that serves the write-path methods, so writes work
// out of the box; heavy/large uploads can still set their own RPC (over-cap flow).
const DEFAULT_RPC = "https://solana-rpc.publicnode.com";
// The feed's cluster (from DEFAULT_RPC), used for the Solscan link. It also
// namespaces the saved-RPC key, so a devnet-era override never carries over to
// mainnet writes (a stale devnet endpoint returned 403 after the mainnet flip).
const CLUSTER = DEFAULT_RPC.indexOf("devnet") >= 0 ? "devnet" : "mainnet-beta";
const RPC_KEY = "iq6900_rpc_" + CLUSTER;
let activeRpc = DEFAULT_RPC;
// Restore the user's own RPC across reloads (localStorage stays client-side,
// never sent to a server). First drop the legacy, non-cluster-namespaced key,
// which could hold a devnet endpoint that 403s on mainnet, so old testers reset
// to the working default on the next load.
try {
  localStorage.removeItem("iq6900_rpc");
  const saved = localStorage.getItem(RPC_KEY); if (saved) activeRpc = saved;
} catch (e) {}
setRpcUrl(activeRpc);

// Reads go through the gateway (a hosted cache that assembles rows from chain),
// not per-tx RPC, so opening the board is one HTTP call instead of a 429 storm.
// Same pattern as iq-chan / iq-wide-web: fallback list + a localStorage override.
// 404 is a real answer (empty table), so it ends the fallback chain like 2xx.
// The gateway must match DEFAULT_RPC's cluster: the mainnet feed reads from the
// mainnet gateway (it indexes any mainnet table by PDA, including our db_root).
const GATEWAYS = ["https://gateway.iqlabs.dev"];
const GATEWAY_KEY = "iq6900_gateway";
function gateways() {
  try { const c = localStorage.getItem(GATEWAY_KEY); if (c) return [c, ...GATEWAYS]; } catch (e) {}
  return GATEWAYS;
}
async function gwFetch(path, init) {
  for (const gw of gateways()) {
    try { const res = await fetch(gw + path, init); if (res.ok || res.status === 404) return res; } catch (e) {}
  }
  throw new Error("all gateways unreachable");
}

const feedTable = feedTablePda.toBase58();

// light for a public RPC (mainnet-verified to 512KB, 0 rpc errors); medium once the user brings their own.
export const recommendSpeed = (isOwnRpc) => (isOwnRpc ? "medium" : "light");

// Manual speed override from the big-file popup; "auto" defers to recommendSpeed.
const SPEED_KEY = "iq6900_speed";
const getSpeed = () => { try { return localStorage.getItem(SPEED_KEY) || "auto"; } catch (e) { return "auto"; } };
const setSpeed = (s) => { try { s === "auto" ? localStorage.removeItem(SPEED_KEY) : localStorage.setItem(SPEED_KEY, s); } catch (e) {} };

window.iqCodein = {
  connect: (rpc) => new Connection(rpc || activeRpc, "confirmed"),
  setRpc: (rpc) => { activeRpc = rpc || DEFAULT_RPC; try { rpc ? localStorage.setItem(RPC_KEY, rpc) : localStorage.removeItem(RPC_KEY); } catch (e) {} setRpcUrl(activeRpc); },
  hasOwnRpc: () => activeRpc !== DEFAULT_RPC,
  setGateway: (url) => { try { url ? localStorage.setItem(GATEWAY_KEY, url) : localStorage.removeItem(GATEWAY_KEY); } catch (e) {} },
  deriveBurner,
  estimateCost,
  inscribe,
  sweep,
  recommendSpeed,
  getSpeed,
  setSpeed,
  feedTable,
  // board = the global feed table rows; mine = the user's assets (the gateway
  // resolves the inventory PDA our writes reference). The SDK reader returns the
  // same row shape as the gateway ({...cols, __txSignature}), so both feed the
  // same UI. The direct read is a fallback for when there is no chain-reading
  // gateway (e.g. devnet); it is only taken on the user's own RPC, since running
  // it on the shared public RPC is exactly the 429 storm the gateway avoids.
  // Both return { rows, nextCursor }. Pass the previous nextCursor as `before`
  // to page older rows (the gateway derives the cursor from its signature scan).
  readBoard: async (limit = 24, before) => {
    try {
      let path = `/table/${feedTable}/rows?limit=${limit}`;
      if (before) path += `&before=${before}`;
      const res = await gwFetch(path);
      if (res.status === 404) return { rows: [], nextCursor: null };
      const data = await res.json();
      return { rows: Array.isArray(data?.rows) ? data.rows : [], nextCursor: data?.nextCursor ?? null };
    } catch (e) {
      if (activeRpc === DEFAULT_RPC) return { rows: [], nextCursor: null };
      return { rows: await reader.readTableRows(feedTablePda, { limit }), nextCursor: null };
    }
  },
  // /user/{pubkey}/assets returns tx-index entries (signature, metadata, ...),
  // NOT decoded rows, so decode those signatures through /slice on the feed
  // table to get the same {kind,body,who} shape the board uses, keeping the
  // newest-first order the assets endpoint returns.
  readMine: async (pubkey, limit = 24) => {
    try {
      const res = await gwFetch(`/user/${pubkey}/assets?limit=${limit}`);
      if (res.status === 404) return { rows: [], nextCursor: null };
      const data = await res.json();
      const assets = Array.isArray(data) ? data : (data.assets ?? []);
      const sigs = assets.map((a) => a.signature).filter(Boolean).slice(0, 50);
      if (!sigs.length) return { rows: [], nextCursor: null };
      const sres = await gwFetch(`/table/${feedTable}/slice?sigs=${sigs.join(",")}`);
      const sdata = sres.ok ? await sres.json() : {};
      const bySig = {};
      (Array.isArray(sdata.rows) ? sdata.rows : []).forEach((r) => { if (r.__txSignature) bySig[r.__txSignature] = r; });
      // Drop sigs that touched the inventory PDA but are not feed rows
      // (user_init, session/chunk txs) -- they decode to an empty row.
      return { rows: sigs.map((s) => bySig[s]).filter((r) => r && r.kind), nextCursor: null };
    } catch (e) {
      if (activeRpc === DEFAULT_RPC) return { rows: [], nextCursor: null };
      return { rows: await reader.readTableRows(contract.getUserInventoryPda(new PublicKey(pubkey), programId), { limit }), nextCursor: null };
    }
  },
  // One decoded row by tx signature, for share links. `/slice` returns the same
  // {kind,body,who,...} row shape as `/rows` (unlike `/data`, which is null for
  // multi-chunk writes). Falls back to the SDK reader on the user's own RPC.
  readOne: async (sig) => {
    try {
      const res = await gwFetch(`/table/${feedTable}/slice?sigs=${sig}`);
      if (res.ok) { const d = await res.json(); const row = (d.rows || [])[0]; if (row) return row; }
    } catch (e) {}
    if (activeRpc === DEFAULT_RPC) return null;
    const out = await reader.readCodeIn(sig);
    try { return JSON.parse(out.data); } catch (e) { return { kind: "text", body: out.data || "" }; }
  },
  // Share targets: the gateway view page renders the inscription (so a tweet
  // card shows it), and the Solscan tx link proves it on-chain.
  viewUrl: (sig) => `${GATEWAYS[0]}/view/${sig}`,
  solscanUrl: (sig) => `https://solscan.io/tx/${sig}${CLUSTER === "devnet" ? "?cluster=devnet" : ""}`,
  cluster: CLUSTER,
  // Image -> ASCII, mirroring the site art generator's brightness ramp
  // (js/art_generate_text.js imgToAsciiArt). step = sampling stride; smaller =
  // more detail and more characters. Kept here so it has no page coupling.
  toAscii: (dataUrl, step = 8, outputHeight = 240) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onerror = () => reject(new Error("image load failed"));
      img.onload = () => {
        const w = Math.max(1, Math.floor(outputHeight * (img.width / img.height)));
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = outputHeight;
        const ctx = cv.getContext("2d");
        ctx.drawImage(img, 0, 0, w, outputHeight);
        const px = ctx.getImageData(0, 0, w, outputHeight).data;
        const ramp = (b, a) => (a === 0 || b < 51) ? " " : b < 102 ? "'" : b < 140 ? ":" : b < 170 ? "i" : b < 200 ? "I" : b < 210 ? "J" : "$";
        const lines = [];
        for (let y = 0; y < outputHeight; y += step) {
          let line = "";
          for (let x = 0; x < w; x += step) { const i = (y * w + x) * 4; line += ramp((px[i] + px[i + 1] + px[i + 2]) / 3, px[i + 3]); }
          lines.push(line);
        }
        resolve(lines.join("\n"));
      };
      img.src = dataUrl;
    }),
  // Best-effort after a confirmed write: tells the gateway to cache the new tx
  // and inject the row, so the board shows it before the next re-index. Never
  // block or fail the inscription on this (the write is already on chain).
  notify: async (sig, row) => {
    const body = JSON.stringify({ txSignature: sig, row });
    for (const gw of gateways()) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      try {
        const res = await fetch(`${gw}/table/${feedTable}/notify`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body, signal: ctrl.signal,
        });
        if (res.ok) return true;
      } catch (e) {} finally { clearTimeout(t); }
    }
    return false;
  },
};
window.dispatchEvent(new Event("iqcodein:ready"));
