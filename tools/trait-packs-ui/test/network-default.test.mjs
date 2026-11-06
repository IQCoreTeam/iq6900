import { test } from 'node:test';
import assert from 'node:assert/strict';
import { net, preset, setNet } from '../../../assets/js/codein/nft_net.js';

test('mainnet launch remains the default and packs need explicit deployment configuration', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  } });
  try {
    assert.equal(net(), 'mainnet');
    assert.equal(preset().gateway, 'https://gateway.iqlabs.dev');
    assert.equal(preset().explorerCluster, '');
    assert.equal(preset().packs, null);
    setNet('devnet');
    assert.equal(net(), 'devnet');
    assert.equal(preset().gateway, 'https://dev-gateway.iqlabs.dev');
    assert.equal(preset().packs, null);
    setNet('unknown');
    assert.equal(net(), 'mainnet');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw Error('storage unavailable'); } });
    assert.equal(net(), 'mainnet');
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});
