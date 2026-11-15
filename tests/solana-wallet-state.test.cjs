const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

// Execute the actual adapter with in-memory Wallet Standard providers. The
// web3 mock only serializes public keys/transactions; no RPC or keys are used.
const account = (id = 1, chains = ['solana:mainnet']) => ({
  address: 'account-' + id,
  publicKey: new Uint8Array(32).fill(id),
  chains,
  features: ['solana:signMessage', 'solana:signTransaction', 'solana:signAndSendTransaction'],
});
function wallet(name, accounts = [account()]) {
  let changed;
  const requests = [];
  const entry = {
    name, chains: ['solana:mainnet', 'solana:devnet'], accounts: [],
    features: {
      'standard:connect': { connect: async options => { requests.push(options); return { accounts }; } },
      'standard:events': { on: (event, listener) => { assert.equal(event, 'change'); changed = listener; } },
      'solana:signMessage': { signMessage: async request => [{ signature: request.message }] },
      'solana:signTransaction': { signTransaction: async request => [{ signedTransaction: request.transaction }] },
    },
  };
  return { entry, requests, change: accounts => { entry.accounts = accounts; changed?.({ accounts }); } };
}
async function load(t, wallets, injected) {
  const dom = new JSDOM('', { url: 'https://iqlabs.dev' });
  t.after(() => dom.window.close());
  if (injected) dom.window.phantom = { solana: injected };
  const context = vm.createContext({
    window: dom.window, CustomEvent: dom.window.CustomEvent,
    localStorage: dom.window.localStorage, setTimeout, console,
  });
  const source = fs.readFileSync(path.join(__dirname, '../assets/js/codein/wallets.js'), 'utf8');
  const mod = new vm.SourceTextModule(source, { context });
  await mod.link(name => {
    assert.equal(name, '@solana/web3.js');
    return new vm.SyntheticModule(['PublicKey', 'Transaction', 'VersionedTransaction'], function () {
      this.setExport('PublicKey', class { constructor(bytes) { this.bytes = bytes; } toBase58() { return 'account-' + this.bytes[0]; } });
      this.setExport('Transaction', class { static from(bytes) { return { bytes }; } });
      this.setExport('VersionedTransaction', class { static deserialize(bytes) { return { bytes }; } });
    }, { context });
  });
  await mod.evaluate();
  for (const w of wallets) {
    dom.window.dispatchEvent(new dom.window.CustomEvent('wallet-standard:register-wallet', { detail: api => api.register(w.entry) }));
  }
  return mod.namespace;
}

test('disconnect outranks a pending silent connection and cannot revive the provider', async t => {
  const w = wallet('Jupiter');
  let finish;
  w.entry.features['standard:connect'].connect = () => new Promise(resolve => { finish = resolve; });
  const api = await load(t, [w]);
  const provider = api.listWallets()[0].provider;
  const pending = api.connectWallet({ onlyIfTrusted: true });
  await new Promise(resolve => setImmediate(resolve));
  api.disconnectWallet();
  finish({ accounts: [account()] });
  assert.equal(await pending, null);
  assert.equal(api.getWalletProvider(), null);
  assert.equal(provider.publicKey, null);
});

test('an older explicit connection cannot replace a newer selected wallet', async t => {
  const a = wallet('Jupiter');
  const b = wallet('Backpack Standard', [account(2)]);
  let finish;
  a.entry.features['standard:connect'].connect = () => new Promise(resolve => { finish = resolve; });
  const api = await load(t, [a, b]);
  const pending = api.connectWallet({ walletId: 'Jupiter' });
  const rejection = assert.rejects(pending, /connection changed/i);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await api.connectWallet({ walletId: 'Backpack Standard' }), 'account-2');
  finish({ accounts: [account()] });
  await rejection;
  assert.equal(api.getWalletProvider().name, 'Backpack Standard');
  assert.equal(api.listWallets().find(w => w.id === 'Jupiter').provider.publicKey, null);
});

test('a Standard wallet without the requested chain is not offered', async t => {
  const w = wallet('Mainnet only');
  w.entry.chains = ['solana:mainnet'];
  const api = await load(t, [w]);
  assert.equal(api.listWallets('devnet').length, 0);
});

test('a wrong-chain account is rejected instead of using the first account', async t => {
  const w = wallet('Jupiter', [account(1, ['solana:mainnet'])]);
  const api = await load(t, [w]);
  await assert.rejects(api.connectWallet({ walletId: 'Jupiter', cluster: 'devnet' }), /account.*solana:devnet/i);
  assert.equal(api.getWalletProvider(), null);
});

test('an account event during connect cannot be overwritten by a stale response', async t => {
  const w = wallet('Jupiter');
  let finish;
  w.entry.features['standard:connect'].connect = () => new Promise(resolve => { finish = resolve; });
  const api = await load(t, [w]);
  const pending = api.connectWallet();
  const rejection = assert.rejects(pending, /account changed/i);
  await new Promise(resolve => setImmediate(resolve));
  w.change([account(2)]);
  finish({ accounts: [account()] });
  await rejection;
  assert.equal(api.listWallets()[0].provider.publicKey.toBase58(), 'account-2');
  assert.equal(api.getWalletProvider(), null);
});

test('a same-account refresh during connect remains valid', async t => {
  const w = wallet('Jupiter');
  let finish;
  w.entry.features['standard:connect'].connect = () => new Promise(resolve => { finish = resolve; });
  const api = await load(t, [w]);
  const pending = api.connectWallet();
  await new Promise(resolve => setImmediate(resolve));
  w.change([account()]);
  finish({ accounts: [account()] });
  assert.equal(await pending, 'account-1');
});

test('a wrong-chain account change disconnects a previously connected adapter', async t => {
  const w = wallet('Jupiter');
  const api = await load(t, [w]);
  await api.connectWallet();
  const provider = api.getWalletProvider();
  let disconnects = 0;
  provider.on('disconnect', () => { disconnects++; });
  w.change([account(2, ['solana:devnet'])]);
  assert.equal(provider.publicKey, null);
  assert.equal(disconnects, 1);
});

test('a pending message signature is rejected after an account switch', async t => {
  const w = wallet('Jupiter');
  const api = await load(t, [w]);
  await api.connectWallet();
  let finish;
  w.entry.features['solana:signMessage'].signMessage = () => new Promise(resolve => { finish = resolve; });
  const pending = api.getWalletProvider().signMessage(new Uint8Array([7, 8]));
  const rejection = assert.rejects(pending, /account changed/i);
  w.change([account(2)]);
  finish([{ signature: new Uint8Array([1]) }]);
  await rejection;
});

test('message signing and transaction requests keep the selected account and chain', async t => {
  const selected = account(2, ['solana:devnet']);
  const w = wallet('Jupiter', [selected]);
  const api = await load(t, [w]);
  await api.connectWallet({ cluster: 'devnet' });
  const provider = api.getWalletProvider();
  const message = new Uint8Array([7, 8]);
  assert.equal((await provider.signMessage(message)).signature, message);
  let request;
  w.entry.features['solana:signTransaction'].signTransaction = async input => { request = input; return [{ signedTransaction: input.transaction }]; };
  const bytes = new Uint8Array([1, 2, 3]);
  assert.deepEqual((await provider.signTransaction({ serialize: () => bytes })).bytes, bytes);
  assert.equal(request.account, selected);
  assert.equal(request.chain, 'solana:devnet');
});

test('legacy injected Phantom keeps its existing signing provider', async t => {
  const injected = { publicKey: { toBase58: () => 'legacy-user' }, connect: async () => {} };
  const api = await load(t, [wallet('Phantom')], injected);
  const choices = api.listWallets();
  assert.equal(choices.length, 1);
  assert.equal(choices[0].provider, injected);
  assert.equal(await api.connectWallet(), 'legacy-user');
  assert.equal(api.getWalletProvider(), injected);
});

test('a pending transaction signature is rejected after an account switch', async t => {
  const w = wallet('Jupiter');
  const api = await load(t, [w]);
  await api.connectWallet();
  let finish;
  w.entry.features['solana:signTransaction'].signTransaction = () => new Promise(resolve => { finish = resolve; });
  const pending = api.getWalletProvider().signTransaction({ serialize: () => new Uint8Array([1]) });
  const rejection = assert.rejects(pending, /account changed/i);
  w.change([account(2)]);
  finish([{ signedTransaction: new Uint8Array([1]) }]);
  await rejection;
});

test('mainnet-beta uses the mainnet chain and unknown network names fail closed', async t => {
  const w = wallet('Jupiter');
  const api = await load(t, [w]);
  assert.equal(await api.connectWallet({ cluster: 'mainnet-beta' }), 'account-1');
  assert.throws(() => api.listWallets('testnet'), /Unsupported Solana network/);
});

test('selecting another wallet invalidates a pending signature from the old provider', async t => {
  const a = wallet('Jupiter');
  const b = wallet('Backpack Standard', [account(2)]);
  const api = await load(t, [a, b]);
  await api.connectWallet({ walletId: 'Jupiter' });
  let finish;
  a.entry.features['solana:signMessage'].signMessage = () => new Promise(resolve => { finish = resolve; });
  const pending = api.getWalletProvider().signMessage(new Uint8Array([7]));
  const rejection = assert.rejects(pending, /connection changed/i);
  await api.connectWallet({ walletId: 'Backpack Standard' });
  finish([{ signature: new Uint8Array([1]) }]);
  await rejection;
  assert.equal(api.getWalletProvider().name, 'Backpack Standard');
});

test('a cached account cannot validate a wrong-chain connect response', async t => {
  const w = wallet('Jupiter', [account(2, ['solana:devnet'])]);
  w.entry.accounts = [account()];
  const api = await load(t, [w]);
  await assert.rejects(api.connectWallet(), /account.*solana:mainnet/i);
  assert.equal(api.getWalletProvider(), null);
});
