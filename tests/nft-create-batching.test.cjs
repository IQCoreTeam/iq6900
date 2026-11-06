const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function creator() {
  const batches = [], prepared = [];
  let compressed = 0, uploaded = 0, maxBuffered = 0, yields = 0;
  const context = vm.createContext({ console, Uint8Array, setTimeout: fn => { yields++; setImmediate(fn); }, localStorage: { getItem: () => null } });
  const api = async (route, _method, body) => {
    if (route === '/creator/stage/begin') return { status: 200, json: { stagingId: 'staged' } };
    if (route === '/creator/stage/batch') { batches.push(JSON.parse(JSON.stringify(body.items))); uploaded += body.items.length; return { status: 200, json: {} }; }
    if (route === '/creator/stage/finish') throw Error('stop after staging');
    throw Error('unexpected route ' + route);
  };
  const imports = {
    './nft_notify.js?v=1': { notifyNftFeedRow() {} },
    '@solana/web3.js': { Keypair: {}, Transaction: {} },
    '@iqlabs-official/solana-sdk': { writer: {} },
    './nft.js?v=packs-refresh-20261101': { api, bytesToBase64: value => Buffer.from(value).toString('base64'), base64ToBytes() {} },
    './inscribe.js?v=9': { topUp() { throw Error('staging never funds'); }, sweep() {}, confirmOrCheck() {}, writeFeedRow() {} },
    './cost.js?v=6': { estimateCost() {}, getAccountRent() {} },
    './image_compress.js?v=1': { compressImage: async pixels => { compressed++; assert.equal(pixels, 'ordinary'); return { bytes: new Uint8Array([99]), mime: 'image/png' }; } },
  };
  const mod = new vm.SourceTextModule(fs.readFileSync(path.join(__dirname, '../assets/js/codein/nft_create.js'), 'utf8'), { context });
  await mod.link(name => {
    const values = imports[name]; assert.ok(values, 'unexpected ' + name);
    return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context });
  });
  await mod.evaluate();
  const run = items => mod.namespace.deploy({ connection: {}, wallet: { publicKey: { toBase58: () => 'owner' } }, burner: { publicKey: { toBase58: () => 'burner' } }, spec: { slug: 'batch-test' }, items });
  return { run, batches, prepared, source(index) { prepared.push(index); maxBuffered = Math.max(maxBuffered, prepared.length - uploaded); return { bytes: new Uint8Array([index, 2]), mime: 'image/webp' }; }, counts: () => ({ compressed, maxBuffered, yields }) };
}

test('validated source bytes survive bounded staging batches while ordinary items still compress', async () => {
  const c = await creator();
  const items = Array.from({ length: 81 }, (_, i) => ({ index: i + 1, name: 'Item ' + i, sourceBytes: async () => c.source(i) }));
  items[80] = { index: 81, name: 'Ordinary', imageData: 'ordinary' };
  await assert.rejects(c.run(items), /stop after staging/);
  assert.deepEqual(c.batches.map(batch => batch.length), [40, 40, 1]);
  assert.deepEqual(c.batches.flat().slice(0, 80).map(row => Buffer.from(row.imageBase64, 'base64')), Array.from({ length: 80 }, (_, i) => Buffer.from([i, 2])));
  assert.equal(c.batches[2][0].imageBase64, Buffer.from([99]).toString('base64'));
  assert.equal(c.counts().compressed, 1);
  assert.equal(c.counts().maxBuffered, 40);
  assert.equal(c.counts().yields, 84); // one per image and one per flushed batch
});

test('invalid reviewed source bytes fail before upload and never enter the compression path', async () => {
  const c = await creator();
  await assert.rejects(c.run([{ name: 'Invalid', sourceBytes: async () => ({ bytes: new Uint8Array([1]), mime: 'image/svg+xml' }) }]), /Unsupported reviewed NFT image/);
  assert.equal(c.batches.length, 0);
  assert.equal(c.counts().compressed, 0);
});
