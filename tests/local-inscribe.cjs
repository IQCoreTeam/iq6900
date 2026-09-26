// Opt-in integration: real transfers and SDK calls against an offline local validator.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function main() {
  const rpc = process.env.IQ_LOCAL_RPC;
  assert.equal(rpc, 'http://127.0.0.1:19109', 'Set the dedicated loopback Surfpool explicitly');
  assert.ok(process.env.IQ_SDK_DIR, 'Set IQ_SDK_DIR to the locally built SDK checkout');
  for (const name of ['SOLANA_RPC_ENDPOINT', 'FRESH_RPC_URL', 'RECENT_RPC_URL', 'HELIUS_RPC_URL', 'ZEROBLOCK_RPC_URL']) process.env[name] = rpc;
  process.env.HELIUS_API_KEY = '';
  process.env.HELIUS_API_KEYS = '';
  const sdkDir = path.resolve(process.env.IQ_SDK_DIR);
  const sdk = require(path.join(sdkDir, 'dist/index.js'));
  const web3 = require(require.resolve('@solana/web3.js', { paths: [sdkDir] }));
  const { sendTx } = require(path.join(sdkDir, 'dist/sdk/writer/writer_utils.js'));
  sdk.setRpcUrl(rpc);
  const connection = new web3.Connection(rpc, 'confirmed');
  const genesis = await connection.getGenesisHash();
  assert.notEqual(genesis, '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d');
  const owner = web3.Keypair.generate();
  const burner = web3.Keypair.generate();
  await connection.requestAirdrop(owner.publicKey, 5e9);
  const sent = [];
  const originalSend = web3.Connection.prototype.sendRawTransaction;
  web3.Connection.prototype.sendRawTransaction = async function (raw, options) {
    assert.equal(this.rpcEndpoint, rpc, 'Nonlocal write blocked');
    const sig = await originalSend.call(this, raw, options);
    sent.push(sig);
    return sig;
  };
  try {
    const dbRootSeed = owner.publicKey.toBuffer();
    const feedSeed = sdk.utils.toSeedBytes('local-media');
    const programId = sdk.contract.PROGRAM_ID;
    await sdk.writer.codeIn({ connection, signer: owner }, 'synthetic owner initialization', 'init.txt');
    await sendTx(connection, owner, sdk.contract.initializeDbRootInstruction(sdk.contract.createInstructionBuilder(), {
      db_root: sdk.contract.getDbRootPda(dbRootSeed), signer: owner.publicKey,
    }, { db_root_id: dbRootSeed }));
    await sdk.writer.createTable(connection, owner, dbRootSeed, feedSeed, 'Local media', ['kind', 'body', 'who'], 'who', [], undefined, []);

    // Link the unmodified application module to the built local SDK, replacing
    // only the production feed identity with the isolated synthetic table.
    const context = vm.createContext({ console, TextEncoder, setTimeout });
    const sources = path.resolve(__dirname, '../assets/js/codein');
    const imported = {
      '@iqlabs-official/solana-sdk': sdk,
      '@solana/web3.js': web3,
      './feed.js': { dbRootSeed, feedSeed, programId },
    };
    const module = new vm.SourceTextModule(fs.readFileSync(path.join(sources, 'inscribe.js'), 'utf8'), { context });
    await module.link((name) => {
      if (name === './cost.js?v=4') return new vm.SourceTextModule(fs.readFileSync(path.join(sources, 'cost.js'), 'utf8'), { context });
      const values = imported[name];
      assert.ok(values, `unexpected import ${name}`);
      return new vm.SyntheticModule(Object.keys(values), function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      }, { context });
    });
    await module.evaluate();
    if (process.env.IQ_EXISTING_BURNER === '1') {
      await connection.requestAirdrop(burner.publicKey, 1e9);
      await sdk.writer.codeIn({ connection, signer: burner }, 'synthetic existing burner', 'init.txt');
      await module.namespace.sweep(connection, burner, owner.publicKey);
      assert.equal(await connection.getBalance(burner.publicKey), 0);
    }
    const wallet = { publicKey: owner.publicKey, signTransaction: async (tx) => { tx.partialSign(owner); return tx; } };
    const body = 'Synthetic on-chain media integration. '.repeat(1200);
    let interruptions = 0;
    let retries = 0;
    const { sig } = await module.namespace.inscribe({
      connection, wallet, burner, kind: 'text', body, speed: 'extreme',
      onProgress: (percent) => { if (percent > 0 && interruptions === 0) { interruptions++; throw new Error('synthetic interrupted upload'); } },
      onRetry: () => { retries++; },
    });
    assert.equal(retries, 1);
    assert.equal((await sdk.reader.readCodeIn(sig, 'extreme')).data, JSON.stringify({ kind: 'text', body, who: owner.publicKey.toBase58() }));
    // Original two-second PCM tone; exercise the actual media envelope too.
    const wav = Buffer.alloc(44 + 32000);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(32000, 40);
    for (let i = 0; i < 16000; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / 8000) * 2000), 44 + 2 * i);
    const mediaBody = 'data:audio/wav;base64,' + wav.toString('base64');
    let mediaRetries = 0;
    const media = await module.namespace.inscribe({ connection, wallet, burner, kind: 'file', body: mediaBody, speed: 'extreme', onRetry: () => { mediaRetries++; } });
    assert.equal(mediaRetries, 0, 'a normal media upload must not need extra funding retries');
    assert.equal((await sdk.reader.readCodeIn(media.sig, 'extreme')).data, JSON.stringify({ kind: 'file', body: mediaBody, who: owner.publicKey.toBase58() }));
    const remaining = await connection.getBalance(burner.publicKey);
    assert.equal(remaining, 0, 'confirmed sweep returns the remaining balance');
    const receipts = [];
    for (const signature of sent) {
      const tx = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 1 });
      assert.ok(tx?.meta);
      assert.equal(tx.meta.err, null);
      receipts.push({ signature, version: tx.version, fee: tx.meta.fee, err: tx.meta.err });
    }
    const result = { scope: 'Offline Surfpool, synthetic content, generated in-memory keys; no mainnet', genesis,
      initializedBurnerFixture: process.env.IQ_EXISTING_BURNER === '1',
      mediaSignature: media.sig, mediaBytes: wav.length,
      signature: sig, bodyBytes: Buffer.byteLength(body), retries, exactReadback: true, burnerLamportsAfterSweep: remaining, receipts };
    if (process.env.IQ_TEST_REPORT) fs.writeFileSync(process.env.IQ_TEST_REPORT, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ signature: sig, successfulReceipts: receipts.length, retries, exactReadback: true, burnerLamportsAfterSweep: remaining }));
  } finally {
    web3.Connection.prototype.sendRawTransaction = originalSend;
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
