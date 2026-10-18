// nft.js - the mint engine for inscription NFTs (collection flow).
//
// The user signs ONE funding transfer; the reused burner then does everything
// with no further popups: pays the deposit, inscribes the item image (C),
// inscribes the canonical metadata (M), and lands the backend-co-signed
// register_item. Leftover sweeps back to the user. Every step is checkpointed
// to localStorage so an interrupted mint resumes without re-paying.
//
// The backend (nft.iqlabs.dev) owns reservation, verification, and co-signing;
// it never holds the user's key and never pays. The chain enforces uniqueness
// and where the money goes. Contract (verified against backend/scripts/mint-e2e):
//   C = feed row {kind:"image", body:"data:<mime>;base64,<bytes>", who:<wallet>}
//       written with the user's inventory PDA referenced, exactly like a post.
//   M = writer.codeIn of the backend's /json body, inscribed verbatim.
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { writer } from "@iqlabs-official/solana-sdk";
import { writeFeedRow, topUp, sweep, confirmOrCheck } from "./inscribe.js?v=8";
import { estimateCost, getAccountRent } from "./cost.js?v=6";

// The backend service. Separate from the gateway (which only serves reads).
// A localStorage override lets a dev point at a local devnet backend.
const NFT_API_DEFAULT = "https://nft.iqlabs.dev";
const API_KEY = "iq6900_nft_api";
export function nftApi() { try { return localStorage.getItem(API_KEY) || NFT_API_DEFAULT; } catch (e) { return NFT_API_DEFAULT; } }
export function setNftApi(url) { try { url ? localStorage.setItem(API_KEY, url) : localStorage.removeItem(API_KEY); } catch (e) {} }

async function api(path, method = "GET", body) {
  const res = await fetch(nftApi() + path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, json, text };
}

// ── Reads (consumed by the launchpad pages) ───────────────────────────────
export async function getCollections() { return (await api("/c")).json?.collections ?? []; }
export async function getCollection(slug) { return (await api(`/c/${slug}`)).json; }
export async function getItems(slug, offset = 0, limit = 60) { return (await api(`/c/${slug}/items?offset=${offset}&limit=${limit}`)).json; }
export async function getRecent(slug, limit = 20) { return (await api(`/c/${slug}/recent?limit=${limit}`)).json?.recent ?? []; }

// ── Funding budget ─────────────────────────────────────────────────────────
// One popup funds the whole mint, so the budget is generous and the remainder
// sweeps back. estimateCost already carries a large margin; on top we add the
// deposit, price, the platform fee the program charges the burner, and the
// register-time account rents (Core asset + inscription record + tx fee).
const PLATFORM_FEE_BPS = 500; // must track the program constant
const ASSET_OVERHEAD = 12_000_000; // Core asset + record rent + register fee, swept back
const IMAGE_CAP_BYTES = 256 * 1024; // covers a squooshed PFP; over-cap just re-funds once
const META_CAP_BYTES = 4096;

export async function estimateMintCost(col, connection, burner) {
  const accountRent = burner ? await getAccountRent(connection, burner.publicKey) : undefined;
  return mintBudget(col, accountRent);
}

function mintBudget(col, accountRent) {
  const price = Number(col.priceLamports || 0);
  const deposit = Number(col.depositLamports || 0);
  const fee = Math.ceil((price * PLATFORM_FEE_BPS) / 10000);
  const imageRowBytes = Math.ceil((IMAGE_CAP_BYTES * 4) / 3) + 128; // base64 + row wrapper
  const img = estimateCost(imageRowBytes, accountRent === undefined ? {} : { accountRent }).total;
  const meta = estimateCost(META_CAP_BYTES, { accountRent: 0 }).total; // accounts exist after C
  return deposit + price + fee + ASSET_OVERHEAD + img + meta;
}

// ── Resume checkpoint ────────────────────────────────────────────────────
const RKEY = (slug) => `iq6900_nft_mint_${slug}`;
function loadProgress(slug) { try { return JSON.parse(localStorage.getItem(RKEY(slug)) || "null"); } catch (e) { return null; } }
function saveProgress(slug, p) { try { localStorage.setItem(RKEY(slug), JSON.stringify(p)); } catch (e) {} }
function clearProgress(slug) { try { localStorage.removeItem(RKEY(slug)); } catch (e) {} }
export function pendingMint(slug) { return loadProgress(slug); }

// ── Helpers ─────────────────────────────────────────────────────────────
function bytesToBase64(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}
function base64ToBytes(b64) { return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); }
async function sha256Hex(bytes) {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function depositTransfer(connection, burner, treasury, lamports) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: burner.publicKey }).add(
    SystemProgram.transfer({ fromPubkey: burner.publicKey, toPubkey: new PublicKey(treasury), lamports }),
  );
  tx.sign(burner);
  const sig = await connection.sendRawTransaction(tx.serialize());
  if (!(await confirmOrCheck(connection, sig, blockhash, lastValidBlockHeight))) throw new Error("deposit transfer was not confirmed");
  return sig;
}

async function fetchItemBytes(gatewayBase, arweaveId, sha256) {
  const res = await fetch(`${gatewayBase.replace(/\/$/, "")}/${arweaveId}`);
  if (!res.ok) throw new Error(`could not fetch the item image (arweave ${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if ((await sha256Hex(bytes)) !== sha256) throw new Error("the fetched image does not match the on-chain manifest hash");
  return bytes;
}

// POST /mint, interpreting the backend's states: a co-signed tx, an already
// confirmed reservation, a transient "retry", or a terminal rejection.
async function mintCall(slug, body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await api(`/c/${slug}/mint`, "POST", body);
    if (r.status === 200) {
      if (r.json.status === "confirmed") return { confirmed: true, index: r.json.index };
      return { transaction: r.json.transaction, lastValidBlockHeight: r.json.lastValidBlockHeight, index: r.json.index };
    }
    if (r.status === 503) { // chain unreadable, not a verdict: keep the reservation alive and retry
      await api(`/c/${slug}/reserve/touch`, "POST", { reservationId: body.reservationId }).catch(() => {});
      await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
      continue;
    }
    if (r.status === 400) { clearProgress(slug); throw new Error("verification failed: " + (r.json?.reason || "mismatch")); }
    if (r.status === 409 || r.status === 404) { clearProgress(slug); throw new Error(r.json?.error || "reservation is no longer valid; start a new mint"); }
    throw new Error(r.json?.error || `mint failed (${r.status})`);
  }
  throw new Error("verification is temporarily unavailable; try again in a moment");
}

async function sendRegister(connection, co, burner, asset) {
  const tx = Transaction.from(base64ToBytes(co.transaction));
  tx.partialSign(burner, asset);
  const sig = await connection.sendRawTransaction(tx.serialize());
  if (!(await confirmOrCheck(connection, sig, tx.recentBlockhash, co.lastValidBlockHeight))) throw new Error("register tx was not confirmed");
  return sig;
}

// ── mint ────────────────────────────────────────────────────────────────
// onStage(stage, extra) reports: funding, deposit, reserve, image, metadata,
// register, confirming, done. onProgress drives the chunk progress bar for C.
export async function mint({ connection, wallet, burner, slug, collection, onStage, onProgress }) {
  const who = wallet.publicKey.toBase58();
  const burnerPk = burner.publicKey.toBase58();
  const stage = (s, x) => { try { onStage && onStage(s, x); } catch (e) {} };
  const col = collection || (await getCollection(slug));
  if (!col || col.error) throw new Error("collection is not available");

  // A saved mint is only resumable for the same wallet+burner (the reservation
  // and the co-sign are bound to them). Otherwise start clean.
  let p = loadProgress(slug);
  if (p && (p.wallet !== who || p.burner !== burnerPk)) p = null;
  p = p || { wallet: who, burner: burnerPk };
  const touch = () => (p.reservationId ? api(`/c/${slug}/reserve/touch`, "POST", { reservationId: p.reservationId }).catch(() => {}) : Promise.resolve());

  // 1. Fund once for the whole mint.
  if (!p.funded) {
    stage("funding");
    const accountRent = await getAccountRent(connection, burner.publicKey);
    await topUp(connection, wallet, burner.publicKey, mintBudget(col, accountRent));
    p.funded = true; saveProgress(slug, p);
  }

  // 2. Deposit (burner -> creator treasury), then reserve an index.
  if (!p.reservationId) {
    if (Number(col.depositLamports) > 0 && !p.depositSig) {
      stage("deposit");
      p.depositSig = await depositTransfer(connection, burner, col.treasury, Number(col.depositLamports));
      saveProgress(slug, p);
    }
    stage("reserve");
    const r = await api(`/c/${slug}/reserve`, "POST", { wallet: who, burner: burnerPk, depositSig: p.depositSig || undefined });
    if (r.status !== 200) {
      if (r.status === 409) { clearProgress(slug); throw new Error("that deposit was already used; start a new mint"); }
      throw new Error(r.json?.error || `reserve failed (${r.status})`);
    }
    p.reservationId = r.json.reservationId;
    p.index = r.json.index;
    p.arweaveId = r.json.arweaveId;
    p.imageSha256 = r.json.imageSha256;
    p.imageMime = r.json.imageMime;
    p.name = r.json.name;
    saveProgress(slug, p);
  }

  // 3. Image inscription C: fetch the bytes, check the manifest hash, write the
  //    exact feed row the verifier reproduces.
  if (!p.C) {
    stage("image", { index: p.index, name: p.name });
    await touch();
    const bytes = await fetchItemBytes(col.arweaveGateway || "https://gateway.irys.xyz", p.arweaveId, p.imageSha256);
    const row = JSON.stringify({ kind: "image", body: `data:${p.imageMime};base64,${bytesToBase64(bytes)}`, who });
    p.C = await writeFeedRow({ connection, burner, row, owner: wallet.publicKey, onProgress });
    saveProgress(slug, p);
  }

  // 4. Metadata inscription M: the canonical JSON from the backend, verbatim.
  if (!p.M) {
    stage("metadata");
    await touch();
    const jr = await api(`/c/${slug}/json/${p.index}?c=${p.C}`);
    if (jr.status !== 200) throw new Error(jr.json?.error || `metadata json failed (${jr.status})`);
    p.M = await writer.codeIn({ connection, signer: burner }, jr.text, `nft-${p.C}.json`, 0, "json");
    saveProgress(slug, p);
  }

  // 5. Register: the asset keypair is throwaway and client-held; persist it so a
  //    resume reuses the same one the backend co-signed against.
  let asset;
  if (p.asset) {
    asset = Keypair.fromSecretKey(Uint8Array.from(p.asset));
  } else {
    asset = Keypair.generate();
    p.asset = Array.from(asset.secretKey); saveProgress(slug, p);
  }
  stage("register");
  await touch();
  let co = await mintCall(slug, { reservationId: p.reservationId, inscriptionSig: p.C, metaSig: p.M, asset: asset.publicKey.toBase58() });

  let mintSig = null;
  if (!co.confirmed) {
    stage("confirming");
    for (let attempt = 0; attempt < 3; attempt++) {
      try { mintSig = await sendRegister(connection, co, burner, asset); break; }
      catch (e) {
        if (attempt >= 2) throw e;
        // Blockhash likely aged out; ask for a fresh co-signed tx (replay path,
        // same reservation + asset) and resend. An expired tx cannot have landed.
        await touch();
        const fresh = await mintCall(slug, { reservationId: p.reservationId });
        if (fresh.confirmed) { mintSig = "(already landed)"; break; }
        co = fresh;
      }
    }
  }

  // 6. Sweep the remainder back, clear the checkpoint, report.
  await sweep(connection, burner, wallet.publicKey).catch(() => {});
  clearProgress(slug);
  const result = { slug, index: p.index, name: p.name, C: p.C, M: p.M, asset: asset.publicKey.toBase58(), mintSig };
  stage("done", result);
  return result;
}
