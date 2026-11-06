import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

if (!process.env.IQ_PACK_CLIENT_ROOT) throw Error('Set IQ_PACK_CLIENT_ROOT to the reviewed companion client checkout');
const require = createRequire(path.join(process.env.IQ_PACK_CLIENT_ROOT, 'package.json'));
const web3 = require('@solana/web3.js');
const bs58 = require('bs58').default;
const mpl = require('@metaplex-foundation/mpl-core');
const generated = path.join(path.dirname(require.resolve('@metaplex-foundation/mpl-core')), 'generated');
const { getAssetV1AccountDataSerializer } = require(path.join(generated, 'types/assetV1AccountData.js'));
const { getPluginRegistryV1AccountDataSerializer } = require(path.join(generated, 'types/pluginRegistryV1AccountData.js'));
const { getAssetV1AccountDataSerializer: getFullAssetSerializer } = require(path.join(generated, '../hooked/assetAccountData.js'));
const { none } = require('@metaplex-foundation/umi');
const address = new web3.PublicKey(new Uint8Array(32).fill(7)).toBase58();
const metadataBytes = Uint8Array.from({ length: 64 }, (_, i) => i + 1);
const M = bs58.encode(metadataBytes), C = bs58.encode(new Uint8Array(64).fill(23));
const metadata = { name: 'Original', attributes: [{ trait_type: 'inscription', value: C }] };
const source = await readFile(new URL('../../../assets/js/codein/nft_asset.js', import.meta.url), 'utf8');
globalThis.__iqAssetRecoveryTest = { web3, bs58, reader: { readUserInventoryCodeInFromTx: async tx => ({ data: tx.inscribedBody }) } };
const transformed = source
  .replace('import { PublicKey } from "@solana/web3.js";', 'const { PublicKey } = globalThis.__iqAssetRecoveryTest.web3;')
  .replace('import { reader } from "@iqlabs-official/solana-sdk";', 'const { reader } = globalThis.__iqAssetRecoveryTest;')
  .replace('import bs58 from "bs58";', 'const { bs58 } = globalThis.__iqAssetRecoveryTest;');
const viewer = await import('data:text/javascript;base64,' + Buffer.from(transformed).toString('base64'));
delete globalThis.__iqAssetRecoveryTest;

function fixture(uri, originalMetadata = Buffer.from(metadataBytes).toString('hex')) {
  const base = Buffer.from(getAssetV1AccountDataSerializer().serialize({
    key: mpl.Key.AssetV1, owner: address,
    updateAuthority: { __kind: 'Collection', fields: [address] },
    name: 'Original', uri, seq: none(),
  }));
  if (originalMetadata === null) return { data: base };
  const edition = Buffer.from(mpl.getPluginSerializer().serialize({ __kind: 'Edition', fields: [{ number: 1 }] }));
  const attributes = Buffer.from(mpl.getPluginSerializer().serialize({ __kind: 'Attributes', fields: [{ attributeList: [
    { key: 'inscription', value: Buffer.from(bs58.decode(C)).toString('hex') },
    { key: 'metadata', value: originalMetadata }, { key: 'std', value: 'iqnft-0.1' },
  ] }] }));
  const oracle = Buffer.from(mpl.getExternalPluginAdapterSerializer().serialize({ __kind: 'Oracle', fields: [{
    baseAddress: address, baseAddressConfig: none(), resultsOffset: { __kind: 'NoOffset' },
  }] }));
  const firstPlugin = base.length + 9, attributesOffset = firstPlugin + edition.length;
  const oracleOffset = attributesOffset + attributes.length, registryOffset = oracleOffset + oracle.length;
  const header = Buffer.from(mpl.getPluginHeaderV1AccountDataSerializer().serialize({ key: mpl.Key.PluginHeaderV1, pluginRegistryOffset: registryOffset }));
  const registry = Buffer.from(getPluginRegistryV1AccountDataSerializer().serialize({
    key: mpl.Key.PluginRegistryV1,
    registry: [
      { pluginType: mpl.PluginType.Edition, authority: { __kind: 'Address', address }, offset: firstPlugin },
      { pluginType: mpl.PluginType.Attributes, authority: { __kind: 'UpdateAuthority' }, offset: attributesOffset },
    ],
    externalRegistry: [{ pluginType: mpl.ExternalPluginAdapterType.Oracle,
      authority: { __kind: 'Address', address }, lifecycleChecks: none(),
      offset: oracleOffset, dataOffset: none(), dataLen: none(),
    }],
  }));
  return { data: Buffer.concat([base, header, edition, attributes, oracle, registry]), headerOffset: base.length, attributesOffset, registryOffset };
}

function connection(data) {
  const reads = [];
  return { reads,
    getAccountInfo: async () => ({ data, owner: new web3.PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d') }),
    getTransaction: async signature => {
      reads.push(signature);
      if (signature === M) return { inscribedBody: JSON.stringify(metadata) };
      if (signature === C) return { inscribedBody: JSON.stringify({ kind: 'image', body: 'data:image/png;base64,original' }) };
      throw Error('Unexpected inscription request');
    },
  };
}

test('preserved metadata survives a derived URI with multiple internal plugins and an external Oracle', async () => {
  for (const uri of ['https://gateway.example/token-meta/' + M, 'https://nft.example/wardrobe/metadata/' + address]) {
    const f = fixture(uri), rpc = connection(f.data);
    const decoded = getFullAssetSerializer().deserialize(f.data)[0];
    assert.equal(decoded.attributes.attributeList.find(row => row.key === 'metadata').value, Buffer.from(metadataBytes).toString('hex'));
    assert(decoded.edition);
    assert(decoded.oracles?.length || decoded.oracle);
    const account = await viewer.readAssetAccount(rpc, address);
    assert.equal(account.M, M);
    const originalFetch = globalThis.fetch, requests = [];
    globalThis.fetch = async url => { requests.push(url); return Response.json(metadata); };
    try {
      const cached = await viewer.viewAssetViaGateway(rpc, 'https://gateway.example', address);
      assert.equal(cached.C, C);
      assert.deepEqual(requests, ['https://gateway.example/token-meta/' + M]);
      const recovered = await viewer.readAsset(rpc, address);
      assert.equal(recovered.M, M);
      assert.equal(recovered.C, C);
      assert.equal(recovered.imageDataUrl, 'data:image/png;base64,original');
      assert.deepEqual(rpc.reads, [M, C]);
    } finally { globalThis.fetch = originalFetch; }
  }
});

test('ordinary URI fallback reads only a valid 64-byte signature from the URL path', async () => {
  const rpc = connection(fixture('https://gateway.example/token-meta/' + M + '?display=1#viewer', null).data);
  assert.equal((await viewer.readAssetAccount(rpc, address)).M, M);
  assert.equal((await viewer.readAsset(rpc, address)).C, C);
  for (const uri of ['https://nft.example/wardrobe/metadata/' + address, 'https://gateway.example/token-meta/not-a-signature']) {
    const invalid = connection(fixture(uri, null).data);
    await assert.rejects(() => viewer.readAsset(invalid, address), /recoverable metadata inscription/);
    assert.deepEqual(invalid.reads, []);
  }
});

test('the original Core image reference survives metadata without a duplicate inscription trait', async () => {
  const rpc = connection(fixture('https://nft.example/wardrobe/metadata/' + address).data);
  const saved = metadata.attributes;
  metadata.attributes = [];
  try {
    const recovered = await viewer.readAsset(rpc, address);
    assert.equal(recovered.M, M);
    assert.equal(recovered.C, C);
    assert.equal(recovered.imageDataUrl, 'data:image/png;base64,original');
    assert.deepEqual(rpc.reads, [M, C]);
  } finally { metadata.attributes = saved; }
});

test('Core-shaped data owned by another program is not accepted as a Core NFT', async () => {
  const f = fixture('https://gateway.example/token-meta/' + M), rpc = connection(f.data);
  rpc.getAccountInfo = async () => ({ data: f.data, owner: web3.SystemProgram.programId });
  await assert.rejects(() => viewer.readAsset(rpc, address), /not a Metaplex Core asset/);
  assert.deepEqual(rpc.reads, []);
});

test('malformed preserved metadata never falls back to the derived asset address', async () => {
  for (const hex of ['f'.repeat(126), 'g'.repeat(128)]) {
    const rpc = connection(fixture('https://nft.example/wardrobe/metadata/' + address, hex).data);
    await assert.rejects(() => viewer.readAsset(rpc, address), /invalid original metadata inscription/);
    assert.deepEqual(rpc.reads, []);
  }
});

test('truncated or oversized Core registry and attribute lengths fail without inscription requests', async () => {
  const uri = 'https://nft.example/wardrobe/metadata/' + address;
  const variants = [];
  let f = fixture(uri); f.data.writeBigUInt64LE(2n ** 63n, f.headerOffset + 1); variants.push(f.data);
  f = fixture(uri); f.data.writeBigUInt64LE(BigInt(f.data.length + 1), f.headerOffset + 1); variants.push(f.data);
  f = fixture(uri); variants.push(f.data.subarray(0, f.registryOffset + 5));
  f = fixture(uri); f.data.writeUInt32LE(0xffffffff, f.attributesOffset + 1); variants.push(f.data);
  f = fixture(uri); f.data.writeUInt32LE(0xffffffff, f.attributesOffset + 5); variants.push(f.data);
  f = fixture(uri); f.data[f.registryOffset + 6] = 4; variants.push(f.data);
  for (const data of variants) {
    const rpc = connection(data);
    await assert.rejects(() => viewer.readAsset(rpc, address), /recoverable metadata inscription/);
    assert.deepEqual(rpc.reads, []);
  }
});
