// nft_create.js - the creator deploy engine for an inscription NFT collection.
//
// The creator signs ONE funding transfer; the reused burner then inscribes the
// manifest and collection.json and lands the one deploy tx (createCollection +
// initialize_registry + platform fee) with no further popups. Images are
// compressed in the browser (squoosh codecs) and uploaded to Arweave by the
// backend, so the creator never fronts Arweave. Leftover sweeps back. Every step
// is checkpointed so an interrupted deploy resumes without re-paying.
//
// The backend (nft.iqlabs.dev) owns Arweave + the shuffle seed + building the
// tx; it never holds the creator key. Contract (backend/src/server.ts creator/*):
//   stage    -> {stagingId, manifestJson, collectionJson, itemCount, deployFeeLamports}
//   creator inscribes manifestJson -> manifestSig, collectionJson -> metaSig
//   deploy   -> a co-built tx (burner payer + new collection keypair sign), fee incl.
//   finalize -> the DB rows, once the registry is on chain.
import { Keypair, Transaction } from "@solana/web3.js";
import { writer } from "@iqlabs-official/solana-sdk";
import { api, bytesToBase64, base64ToBytes } from "./nft.js?v=2";
import { topUp, sweep, confirmOrCheck } from "./inscribe.js?v=8";
import { estimateCost, getAccountRent } from "./cost.js?v=6";
import { compressImage } from "./image_compress.js?v=1";

// Collection account + registry (bitmap) rent + tx fees, swept back after deploy.
const DEPLOY_OVERHEAD = 15_000_000;

// ── Resume checkpoint (keyed by slug; distinct from mint's) ────────────────
const RKEY = (slug) => `iq6900_nft_deploy_${slug}`;
function loadProgress(slug) { try { return JSON.parse(localStorage.getItem(RKEY(slug)) || "null"); } catch (e) { return null; } }
function saveProgress(slug, p) { try { localStorage.setItem(RKEY(slug), JSON.stringify(p)); } catch (e) {} }
function clearProgress(slug) { try { localStorage.removeItem(RKEY(slug)); } catch (e) {} }
export function pendingDeploy(slug) { return loadProgress(slug); }

// The /creator/stage body: spec fields + the creator wallet + the compressed items.
function stageBody(spec, creator, items) {
  return {
    slug: spec.slug, creator, name: spec.name, symbol: spec.symbol,
    description: spec.description || "", price: spec.price || 0, deposit: spec.deposit || 0,
    royaltyBps: spec.royaltyBps || 0, sequential: !!spec.sequential, items,
  };
}

// One funding transfer covers: manifest inscription (first write carries the
// burner's user-init rent), collection.json inscription, and the deploy tx
// (collection + registry rent, platform fee, tx fees). estimateCost carries a
// large margin and the remainder sweeps back, so this is deliberately generous.
async function deployBudget(connection, burner, { manifestJson, collectionJson, deployFeeLamports }) {
  const accountRent = await getAccountRent(connection, burner.publicKey);
  const manifestBytes = new TextEncoder().encode(manifestJson).length;
  const collBytes = new TextEncoder().encode(collectionJson).length;
  const manifest = estimateCost(manifestBytes, { accountRent }).total;
  const coll = estimateCost(collBytes, { accountRent: 0 }).total; // burner inited by the manifest write
  return manifest + coll + Number(deployFeeLamports || 0) + DEPLOY_OVERHEAD;
}

// ── deploy ─────────────────────────────────────────────────────────────────
// items: [{ index?, name, imageData, template }] where imageData is decoded
// pixels ({data,width,height}). onStage(stage, extra) reports: compress, stage,
// funding, manifest, collection, deploy, finalize, done.
export async function deploy({ connection, wallet, burner, spec, items, onStage }) {
  const who = wallet.publicKey.toBase58();
  const burnerPk = burner.publicKey.toBase58();
  const stage = (s, x) => { try { onStage && onStage(s, x); } catch (e) {} };
  const slug = spec.slug;

  let p = loadProgress(slug);
  if (p && (p.wallet !== who || p.burner !== burnerPk)) p = null;
  p = p || { wallet: who, burner: burnerPk };

  // 1. Compress each image (squoosh) and stage: Arweave upload + manifest, with
  //    the shuffle seed generated and kept server-side.
  if (!p.stagingId) {
    const staged = [];
    for (let i = 0; i < items.length; i++) {
      stage("compress", { done: i, total: items.length });
      // imageData may be a thunk (generative sets build one composite at a time,
      // so thousands of raw bitmaps never sit in memory at once).
      const src = items[i].imageData;
      const imageData = typeof src === "function" ? await src() : src;
      const { bytes, mime } = await compressImage(imageData, spec.compress);
      staged.push({ index: items[i].index ?? i + 1, name: items[i].name, mime, imageBase64: bytesToBase64(bytes), template: items[i].template || {} });
    }
    stage("stage", { total: items.length });
    const r = await api("/creator/stage", "POST", stageBody(spec, who, staged));
    if (r.status === 409) throw new Error(`the handle "${slug}" is taken; pick another`);
    if (r.status !== 200) throw new Error(r.json?.error || `stage failed (${r.status})`);
    p.stagingId = r.json.stagingId;
    p.manifestJson = r.json.manifestJson;
    p.collectionJson = r.json.collectionJson;
    p.itemCount = r.json.itemCount;
    p.deployFeeLamports = r.json.deployFeeLamports;
    saveProgress(slug, p);
  }

  // 2. Fund once.
  if (!p.funded) {
    stage("funding");
    await topUp(connection, wallet, burner.publicKey, await deployBudget(connection, burner, p));
    p.funded = true; saveProgress(slug, p);
  }

  // 3. Inscribe the manifest, then collection.json, via the burner.
  if (!p.manifestSig) {
    stage("manifest");
    p.manifestSig = await writer.codeIn({ connection, signer: burner }, p.manifestJson, "manifest.json", 0, "json");
    saveProgress(slug, p);
  }
  if (!p.metaSig) {
    stage("collection");
    p.metaSig = await writer.codeIn({ connection, signer: burner }, p.collectionJson, "collection.json", 0, "json");
    saveProgress(slug, p);
  }

  // 4. The collection keypair is throwaway and client-held; persist it so a
  //    resume builds against the same account the backend co-signs.
  let col;
  if (p.collectionSecret) col = Keypair.fromSecretKey(Uint8Array.from(p.collectionSecret));
  else { col = Keypair.generate(); p.collectionSecret = Array.from(col.secretKey); saveProgress(slug, p); }

  // 5. Build the deploy tx (backend), sign (burner payer + collection keypair), land.
  stage("deploy");
  const d = await api("/creator/deploy", "POST", { stagingId: p.stagingId, creator: who, collection: col.publicKey.toBase58(), payer: burnerPk, manifestSig: p.manifestSig, metaSig: p.metaSig });
  if (d.status === 404) { clearProgress(slug); throw new Error("the staged deploy expired; run it again"); }
  if (d.status !== 200) throw new Error(d.json?.error || `deploy build failed (${d.status})`);
  const tx = Transaction.from(base64ToBytes(d.json.transaction));
  tx.partialSign(burner, col);
  const deploySig = await connection.sendRawTransaction(tx.serialize());
  if (!(await confirmOrCheck(connection, deploySig, tx.recentBlockhash, d.json.lastValidBlockHeight))) throw new Error("deploy tx was not confirmed");

  // 6. Finalize (DB rows once the registry is on chain), sweep, report.
  stage("finalize");
  const f = await api("/creator/finalize", "POST", { stagingId: p.stagingId });
  if (f.status !== 200) throw new Error(f.json?.error || `finalize failed (${f.status})`);
  await sweep(connection, burner, wallet.publicKey).catch(() => {});
  clearProgress(slug);
  const result = { slug, collection: col.publicKey.toBase58(), registry: d.json.registry, deploySig, itemCount: p.itemCount };
  stage("done", result);
  return result;
}
