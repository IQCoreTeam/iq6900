const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function loadTransfers(writer) {
  const context = vm.createContext({ console, TextEncoder, setTimeout: (cb) => { cb(); } });
  class Transaction {
    add() { return this; }
    sign() {}
    serialize() { return new Uint8Array([1]); }
  }
  const imports = {
    '@iqlabs-official/solana-sdk': { contract: { getUserInventoryPda: () => 'inventory' }, writer },
    '@solana/web3.js': { SystemProgram: { transfer: (args) => args }, Transaction },
    './feed.js': { dbRootSeed: 'synthetic-root', feedSeed: 'synthetic-feed', programId: 'synthetic-program' },
    './cost.js?v=6': { estimateCost: () => ({ total: 1000000 }), getAccountRent: async () => 0 },
  };
  const module = new vm.SourceTextModule(fs.readFileSync(path.resolve(__dirname, '../assets/js/codein/inscribe.js'), 'utf8'), { context });
  await module.link((name) => {
    const values = imports[name];
    assert.ok(values, `unexpected import: ${name}`);
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  return module.namespace;
}

for (const mode of ['normal-error', 'polled-error', 'never-confirmed', 'success']) {
  test(`sweep reports ${mode} accurately`, async () => {
    const { sweep } = await loadTransfers({});
    const executionError = { InstructionError: [0, 'InsufficientFunds'] };
    const connection = {
      getBalance: async () => 1000000,
      getLatestBlockhash: async () => ({ blockhash: 'synthetic', lastValidBlockHeight: 10 }),
      sendRawTransaction: async () => 'synthetic-transfer',
      confirmTransaction: async () => {
        if (mode === 'polled-error' || mode === 'never-confirmed') {
          const e = new Error('expired'); e.name = 'TransactionExpiredBlockheightExceededError'; throw e;
        }
        return { value: { err: mode === 'normal-error' ? executionError : null } };
      },
      getSignatureStatuses: async () => ({ value: [mode === 'polled-error' ? { confirmationStatus: 'confirmed', err: executionError } : null] }),
    };
    if (mode === 'success') assert.equal(await sweep(connection, { publicKey: 'burner' }, 'owner'), 995000);
    else await assert.rejects(sweep(connection, { publicKey: 'burner' }, 'owner'), mode === 'never-confirmed' ? /not confirmed/ : /InsufficientFunds/);
  });
}

test('failed funding does not start an inscription', async () => {
  let writes = 0;
  const { inscribe } = await loadTransfers({ writeRow: async () => { writes++; return 'synthetic-write'; } });
  const wallet = { publicKey: { toBase58: () => 'owner' }, signTransaction: async (tx) => tx };
  const connection = {
    getAccountInfo: async () => ({}),
    getBalance: async (key) => key === wallet.publicKey ? 10000000 : 0,
    getLatestBlockhash: async () => ({ blockhash: 'synthetic', lastValidBlockHeight: 10 }),
    sendRawTransaction: async () => 'synthetic-transfer',
    confirmTransaction: async () => ({ value: { err: { InstructionError: [0, 'InsufficientFunds'] } } }),
  };
  await assert.rejects(inscribe({ connection, wallet, burner: { publicKey: 'burner' }, kind: 'text', body: 'synthetic' }), /InsufficientFunds/);
  assert.equal(writes, 0);
});

// web3's preflight rejects a transfer whose blockhash expired while the wallet
// popup was open (long approval, or a lagging RPC). That is as harmless as a
// post-send expiry, so funding must re-sign with a fresh blockhash, not fail.
for (const outcome of ['recovers', 'gives-up']) {
  test(`funding re-signs with a fresh blockhash after a preflight Blockhash-not-found (${outcome})`, async () => {
    const { topUp } = await loadTransfers({});
    let signs = 0, hashes = 0, sends = 0, burnerBal = 0;
    const wallet = { publicKey: { toBase58: () => 'owner' }, signTransaction: async (tx) => { signs++; return tx; } };
    const connection = {
      getBalance: async (key) => key === wallet.publicKey ? 10000000 : burnerBal,
      getLatestBlockhash: async () => ({ blockhash: 'hash-' + (++hashes), lastValidBlockHeight: 10 }),
      sendRawTransaction: async () => {
        sends++;
        if (outcome === 'gives-up' || sends === 1) throw new Error('Simulation failed.\nMessage: Transaction simulation failed: Blockhash not found.\nLogs:\n[].\nCatch the `SendTransactionError` and call `getLogs()` on it for full details.');
        burnerBal = 1000000; return 'synthetic-transfer';
      },
      confirmTransaction: async () => ({ value: { err: null } }),
    };
    if (outcome === 'recovers') {
      await topUp(connection, wallet, 'burner', 1000000);
      assert.deepEqual({ signs, hashes, sends }, { signs: 2, hashes: 2, sends: 2 });
    } else {
      await assert.rejects(topUp(connection, wallet, 'burner', 1000000), /nothing was spent/);
      assert.equal(sends, 2);
    }
  });
}

test('funding still surfaces a real simulation failure', async () => {
  const { topUp } = await loadTransfers({});
  const wallet = { publicKey: { toBase58: () => 'owner' }, signTransaction: async (tx) => tx };
  const connection = {
    getBalance: async (key) => key === wallet.publicKey ? 10000000 : 0,
    getLatestBlockhash: async () => ({ blockhash: 'synthetic', lastValidBlockHeight: 10 }),
    sendRawTransaction: async () => { const e = new Error('Simulation failed.\nMessage: Transaction simulation failed: Attempt to debit an account but found no record of a prior credit.'); e.logs = []; throw e; },
  };
  await assert.rejects(topUp(connection, wallet, 'burner', 1000000), /prior credit/);
});
