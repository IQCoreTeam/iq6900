// nft_asset.js - read an inscription NFT: the asset account from chain, then
// either the gateway cache (default, fast) or the chain itself (the "recover
// without us" proof). The chain path: given only an
// asset address and an RPC, it reads the Core asset account, pulls the metadata
// inscription (M, preserved in Attributes even after outfit opt-in) and the image
// inscription (C, the inscription attribute inside that metadata), and decodes
// both with the SDK reader. The gateway is never called.
//
// The Core asset account is parsed directly (web3 PublicKey for base58), so no
// mpl-core/umi is pulled into the browser. The base-field + Attributes parser
// was verified byte-for-byte against mpl-core deserializeAssetV1 on a live
// devnet asset (see backend/scripts and the probe harness), so it is exact, not
// a heuristic. Our register_item always writes index/inscription/metadata/std.
import { PublicKey } from "@solana/web3.js";
import { reader } from "@iqlabs-official/solana-sdk";
import bs58 from "bs58";

const u32 = (d, o) => {
  if (o < 0 || o + 4 > d.length) throw new Error("truncated Core account");
  return new DataView(d.buffer, d.byteOffset + o, 4).getUint32(0, true);
};
const u64 = (d, o) => {
  if (o < 0 || o + 8 > d.length) throw new Error("truncated Core registry");
  const n = new DataView(d.buffer, d.byteOffset + o, 8).getBigUint64(0, true);
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("invalid Core registry offset");
  return Number(n);
};
const utf8 = (b) => new TextDecoder().decode(b);

function attributeSignature(value, label) {
  if (value === undefined) return null;
  if (!/^[0-9a-fA-F]{128}$/.test(value)) throw new Error("invalid original " + label + " inscription");
  return bs58.encode(Uint8Array.from(value.match(/../g), (byte) => parseInt(byte, 16)));
}

function imageSignature(account, metadata) {
  if (account.C) return account.C;
  const value = Array.isArray(metadata.attributes) ? metadata.attributes.find((a) => a.trait_type === "inscription")?.value : null;
  try { return typeof value === "string" && value.length <= 90 && bs58.decode(value).length === 64 ? value : null; }
  catch { return null; }
}

// Core AssetV1 base fields: key(1) owner(32) updateAuthority(enum) name uri seq.
function parseAssetBase(d) {
  let o = 0;
  const key = d[o++];
  const owner = new PublicKey(d.slice(o, o + 32)).toBase58(); o += 32;
  const uaKind = d[o++]; // 0 None, 1 Address, 2 Collection
  if (uaKind > 2) throw new Error("invalid Core update authority");
  let collection = null;
  if (uaKind === 1 || uaKind === 2) { collection = new PublicKey(d.slice(o, o + 32)).toBase58(); o += 32; }
  const nl = u32(d, o); o += 4;
  if (nl > d.length - o) throw new Error("truncated Core name");
  const name = utf8(d.subarray(o, o + nl)); o += nl;
  const ul = u32(d, o); o += 4;
  if (ul > d.length - o) throw new Error("truncated Core uri");
  const uri = utf8(d.subarray(o, o + ul)); o += ul;
  const seq = d[o++];
  if (seq !== 0 && seq !== 1) throw new Error("invalid Core sequence");
  if (seq === 1) { u64(d, o); o += 8; } // Option<u64>
  return { key, owner, collection, name, uri, pluginOffset: o };
}

// Follow the Core registry instead of assuming Attributes is the first plugin.
// Outfit opt-in can add an external Oracle adapter without changing recovery.
function parseAttributes(d, o) {
  try {
    if (d[o] !== 3) return {};
    const firstPlugin = o + 9, registry = u64(d, o + 1);
    if (registry < firstPlugin || registry >= d.length || d[registry] !== 4) return {};
    o = registry + 1;
    const records = u32(d, o); o += 4;
    if (records > (d.length - o) / 10) return {};
    let attributes = null;
    for (let i = 0; i < records; i++) {
      const type = d[o++], authority = d[o++];
      if (authority === 3) o += 32;
      else if (authority > 2) return {};
      const offset = u64(d, o); o += 8;
      if (offset < firstPlugin || offset >= registry) return {};
      if (type === 6) {
        if (attributes !== null || d[offset] !== 6) return {};
        attributes = offset + 1;
      }
    }
    if (attributes === null) return {};
    // Restrict string/vector reads to the plugin-data region, never the registry.
    d = d.subarray(0, registry);
    o = attributes;
    const n = u32(d, o); o += 4;
    if (n > (d.length - o) / 8) return {};
    const out = Object.create(null);
    for (let i = 0; i < n; i++) {
      const kl = u32(d, o); o += 4;
      if (kl > d.length - o) return {};
      const k = utf8(d.subarray(o, o + kl)); o += kl;
      const vl = u32(d, o); o += 4;
      if (vl > d.length - o || Object.hasOwn(out, k)) return {};
      const v = utf8(d.subarray(o, o + vl)); o += vl;
      out[k] = v;
    }
    return out;
  } catch (e) { return {}; }
}

export async function readInscription(connection, sig) {
  const tx = await connection.getTransaction(sig, { maxSupportedTransactionVersion: 1 });
  if (!tx) throw new Error("inscription tx not found on this RPC: " + sig);
  const res = await reader.readUserInventoryCodeInFromTx(tx);
  return res.data; // the inscribed body, verbatim
}

// readAssetAccount(connection, assetAddress) -> the Core asset account alone
// (one getAccountInfo): name, owner, collection, uri, the Attributes we wrote,
// and M = the original metadata inscription. This is the
// fast, shared first step of both viewer paths below.
export async function readAssetAccount(connection, assetAddress) {
  const pk = new PublicKey(assetAddress); // throws on a malformed address
  const ai = await connection.getAccountInfo(pk);
  if (!ai) throw new Error("no account at that address");
  const data = new Uint8Array(ai.data);
  if (ai.owner?.toBase58() !== "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d" || data[0] !== 1)
    throw new Error("not a Metaplex Core asset");
  const base = parseAssetBase(data);
  const attrs = parseAttributes(data, base.pluginOffset);
  let M = attributeSignature(attrs.metadata, "metadata");
  if (!M) {
    try {
      M = new URL(base.uri).pathname.split("/").pop();
      if (!M || M.length > 90 || bs58.decode(M).length !== 64) M = null;
    } catch { M = null; }
  }
  if (!M) throw new Error("asset has no recoverable metadata inscription");
  return { asset: assetAddress, name: base.name, owner: base.owner, collection: base.collection, uri: base.uri, attributes: attrs, M, C: attributeSignature(attrs.inscription, "image") };
}

// viewAssetViaGateway(connection, gatewayBase, assetAddress) -> what the viewer
// shows by default: the account from chain, then the metadata JSON and the
// image from the gateway cache (/token-meta/{M}, /img/{C}.png). Fast (1 rpc
// call + 2 cached http gets); the gateway only serves what is on chain.
export async function gatewayMetadata(gatewayBase, M) {
  const res = await fetch(gatewayBase + "/token-meta/" + M);
  if (!res.ok) throw new Error("gateway has no metadata for " + M + " (http " + res.status + ")");
  return res.json();
}
export async function viewAssetViaGateway(connection, gatewayBase, assetAddress) {
  const account = await readAssetAccount(connection, assetAddress);
  const metadata = await gatewayMetadata(gatewayBase, account.M);
  const C = imageSignature(account, metadata);
  return { ...account, C, metadata, imageUrl: C ? gatewayBase + "/img/" + C + ".png" : null };
}

// readAsset(connection, assetAddress) -> the same thing decoded from chain only
// (the "recover without us" proof). onStep(name) reports: account, metadata,
// image. Throws with a plain message if the address is not a minted
// inscription NFT.
export async function readAsset(connection, assetAddress, onStep) {
  const step = (s) => { try { onStep && onStep(s); } catch (e) {} };
  step("account");
  const account = await readAssetAccount(connection, assetAddress);

  // M -> the metadata JSON that was inscribed, verbatim.
  step("metadata");
  const metaStr = await readInscription(connection, account.M);
  let metadata;
  try { metadata = JSON.parse(metaStr); } catch (e) { throw new Error("metadata inscription is not valid JSON"); }
  const C = imageSignature(account, metadata);

  // C -> the image row that was inscribed; its body is a ready data URL.
  let imageDataUrl = null;
  if (C) {
    step("image");
    try {
      const body = await readInscription(connection, C);
      const row = JSON.parse(body);
      imageDataUrl = row.body || null; // "data:<mime>;base64,..."
    } catch (e) { imageDataUrl = null; } // image recovery is best-effort; metadata already carries a pointer
  }

  return { ...account, C, metadata, imageDataUrl };
}
