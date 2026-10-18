// nft_asset.js - read an inscription NFT entirely from chain, no backend.
//
// This is the "recover without us" path the viewer demonstrates: given only an
// asset address and an RPC, it reads the Core asset account, pulls the metadata
// inscription (M, the last path segment of the on-chain uri) and the image
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

const u32 = (d, o) => d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | d[o + 3] * 0x1000000;
const utf8 = (b) => new TextDecoder().decode(b);

// Core AssetV1 base fields: key(1) owner(32) updateAuthority(enum) name uri seq.
function parseAssetBase(d) {
  let o = 0;
  const key = d[o++];
  const owner = new PublicKey(d.slice(o, o + 32)).toBase58(); o += 32;
  const uaKind = d[o++]; // 0 None, 1 Address, 2 Collection
  let collection = null;
  if (uaKind === 1 || uaKind === 2) { collection = new PublicKey(d.slice(o, o + 32)).toBase58(); o += 32; }
  const nl = u32(d, o); o += 4; const name = utf8(d.slice(o, o + nl)); o += nl;
  const ul = u32(d, o); o += 4; const uri = utf8(d.slice(o, o + ul)); o += ul;
  const seq = d[o++]; if (seq === 1) o += 8; // Option<u64>
  return { key, owner, collection, name, uri, pluginOffset: o };
}

// The Attributes plugin (our only plugin on an item): plugin header (key 3 +
// u64 registry offset), then Plugin::Attributes discriminant, then the
// Vec<{key,value}>. Best-effort: returns {} if the layout ever differs, so the
// viewer's on-chain recovery path never depends on it.
function parseAttributes(d, o) {
  try {
    if (d[o] !== 3) return {};
    o += 1 + 8 + 1; // header key(1) + registryOffset(8) + Attributes discriminant(1)
    const n = u32(d, o); o += 4;
    const out = {};
    for (let i = 0; i < n; i++) {
      const kl = u32(d, o); o += 4; const k = utf8(d.slice(o, o + kl)); o += kl;
      const vl = u32(d, o); o += 4; const v = utf8(d.slice(o, o + vl)); o += vl;
      out[k] = v;
    }
    return out;
  } catch (e) { return {}; }
}

async function readInscription(connection, sig) {
  const tx = await connection.getTransaction(sig, { maxSupportedTransactionVersion: 1 });
  if (!tx) throw new Error("inscription tx not found on this RPC: " + sig);
  const res = await reader.readUserInventoryCodeInFromTx(tx);
  return res.data; // the inscribed body, verbatim
}

// readAsset(connection, assetAddress) -> everything the viewer shows, all from
// chain. onStep(name) reports: account, metadata, image. Throws with a plain
// message if the address is not a minted inscription NFT.
export async function readAsset(connection, assetAddress, onStep) {
  const step = (s) => { try { onStep && onStep(s); } catch (e) {} };
  const pk = new PublicKey(assetAddress); // throws on a malformed address

  step("account");
  const ai = await connection.getAccountInfo(pk);
  if (!ai) throw new Error("no account at that address");
  const data = new Uint8Array(ai.data);
  if (data[0] !== 1) throw new Error("not a Metaplex Core asset");
  const base = parseAssetBase(data);
  const attrs = parseAttributes(data, base.pluginOffset);

  const M = (base.uri.split("/").pop() || "").trim();
  if (!M) throw new Error("asset has no metadata uri");

  // M -> the metadata JSON that was inscribed, verbatim.
  step("metadata");
  const metaStr = await readInscription(connection, M);
  let metadata;
  try { metadata = JSON.parse(metaStr); } catch (e) { throw new Error("metadata inscription is not valid JSON"); }
  const C = (metadata.attributes || []).find((a) => a.trait_type === "inscription")?.value || null;

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

  return {
    asset: assetAddress,
    name: base.name,
    owner: base.owner,
    collection: base.collection,
    uri: base.uri,
    attributes: attrs, // { index, inscription (hex), metadata (hex), std }
    M,
    C,
    metadata,
    imageDataUrl,
  };
}
