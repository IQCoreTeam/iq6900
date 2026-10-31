import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialPoolShares } from '../../../assets/packs-rarity.mjs';
test('initial supply shares are not four independent per-pack probabilities', () => {
  const shares = initialPoolShares([40, 24, 12, 4].map((initialSupply,id) => ({id,initialSupply})));
  assert.deepEqual(shares.map(row => row.perDrawShare), [0.5,0.3,0.15,0.05]);
  assert.equal(shares.reduce((sum,row) => sum+row.perDrawShare,0),1);
});
test('unknown, malformed or duplicated supply fails rather than inventing odds', () => {
  for (const rows of [[],[{id:0}],[{id:0,initialSupply:-1}],[{id:0,initialSupply:1},{id:0,initialSupply:2}]]) assert.throws(() => initialPoolShares(rows));
});
