const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function costs() {
  const context = vm.createContext({});
  const module = new vm.SourceTextModule(fs.readFileSync(path.resolve(__dirname, '../assets/js/codein/cost.js'), 'utf8'), { context });
  const contract = {
    PROGRAM_ID: 'iq', getCodeAccountPda: () => 'code',
    getUserInventoryPda: () => 'inventory', getUserPda: () => 'state',
  };
  await module.link(() => new vm.SyntheticModule(['contract', 'constants'], function () {
    this.setExport('contract', contract);
    this.setExport('constants', { CODE_ACCOUNT_SPACE: 4215, USER_INVENTORY_SPACE: 4213 });
  }, { context }));
  await module.evaluate();
  return module.namespace;
}

for (const scenario of ['fresh', 'legacy', 'initialized', 'foreign-owner']) {
  test(`rent quote handles ${scenario} accounts`, async () => {
    const { getAccountRent, estimateCost } = await costs();
    const rent = (size) => (size + 128) * 6960;
    const sizes = scenario === 'legacy' ? [1019, 1017, 1146] : [4215, 4213, 1146];
    const accounts = scenario === 'fresh' ? [null, null, null] : sizes.map((size) => ({
      data: new Uint8Array(size), lamports: rent(size), owner: { equals: () => scenario !== 'foreign-owner' },
    }));
    const connection = { getMultipleAccountsInfo: async () => accounts, getMinimumBalanceForRentExemption: async (size) => rent(size) };
    if (scenario === 'foreign-owner') return assert.rejects(getAccountRent(connection, 'synthetic'), /owner/);
    const quoted = await getAccountRent(connection, 'synthetic');
    const expected = scenario === 'fresh' ? 69307680 : scenario === 'legacy' ? (4215 - 1019 + 4213 - 1017) * 6960 : 0;
    assert.equal(quoted, expected);
    assert.equal(estimateCost(45600, { accountRent: quoted }).rent, 1545120 + expected);
  });
}

test('a failed rent quote prevents returning an invented budget', async () => {
  const { getAccountRent } = await costs();
  await assert.rejects(getAccountRent({
    getMultipleAccountsInfo: async () => [null, null, null],
    getMinimumBalanceForRentExemption: async () => { throw new Error('RPC unavailable'); },
  }, 'synthetic'), /RPC unavailable/);
});
