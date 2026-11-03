const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto, createHash } = require("node:crypto");
const codein = (f) => fs.readFileSync(path.join(__dirname, "../assets/js/codein", f), "utf8");

// The mint engine (nft.js) with a resumable checkpoint past the reserve step, a
// backend that answers "confirmed" to the co-sign, and a /mint/landed route
// that answers the given statuses in order (then 200).
async function engine({ landedStatuses = [200], throwLanded = false, refundFailure = false, ownerStatus = 200, ownerBody = {items: []} } = {}) {
  const bytes = Buffer.from([1, 2, 3]);
  const store = new Map([["iq6900_nft_mint_test", JSON.stringify({ wallet: "owner", burner: "burner", funded: true, reservationId: "reservation", index: 1, arweaveId: "image", imageSha256: createHash("sha256").update(bytes).digest("hex"), imageMime: "image/png", name: "Fixture", asset: [1] })]]);
  const calls = [];
  const statuses = [...landedStatuses];
  const fetch = async (url, init) => {
    const u = String(url);
    if (u.includes("/owner/")) return {status: ownerStatus, text: async () => JSON.stringify(ownerBody)};
    if (u.endsWith("/image")) return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    if (u.endsWith("/mint/landed")) {
      calls.push({ landed: JSON.parse(init.body) });
      if (throwLanded) throw Error("offline");
      const status = statuses.shift() ?? 200;
      return { status, text: async () => JSON.stringify({ status: status === 202 ? "pending" : "confirmed", index: 1 }) };
    }
    return { status: 200, text: async () => JSON.stringify(u.includes("/mint") ? { status: "confirmed", index: 1 } : { name: "Metadata" }) };
  };
  const context = vm.createContext({
    fetch, console, crypto: webcrypto, TextEncoder, Uint8Array,
    btoa: (s) => Buffer.from(s, "binary").toString("base64"), atob: (s) => Buffer.from(s, "base64").toString("binary"),
    setTimeout: (f) => setImmediate(f), // the retry back-off, instant here
    localStorage: { getItem: (k) => store.get(k) || null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) },
  });
  const imports = {
    "@solana/web3.js": { Keypair: { fromSecretKey: () => ({ publicKey: { toBase58: () => "asset" }, secretKey: new Uint8Array([1]) }) }, PublicKey: class {}, SystemProgram: {}, Transaction: class {} },
    "@iqlabs-official/solana-sdk": { writer: { codeIn: async () => "M" } },
    "./nft_notify.js?v=1": { notifyNftFeedRow: async () => true },
    "./inscribe.js?v=10": { writeFeedRow: async () => "C", topUp: async () => { throw Error("unexpected funding"); }, sweep: async () => { calls.push("sweep"); if(refundFailure)throw Error("refund RPC unavailable"); }, confirmOrCheck: async () => true },
    "./cost.js?v=6": { estimateCost: () => ({ total: 1 }), getAccountRent: async () => 0 },
  };
  const mod = new vm.SourceTextModule(codein("nft.js"), { context });
  await mod.link((name) => {
    if (name === "./nft_refund.js?v=1") return new vm.SourceTextModule(codein("nft_refund.js"), { context });
    if (name === "./nft_net.js?v=2") return new vm.SourceTextModule(codein("nft_net.js"), { context });
    const values = imports[name];
    assert.ok(values, "unexpected " + name);
    return new vm.SyntheticModule(Object.keys(values), function () { for (const [k, v] of Object.entries(values)) this.setExport(k, v); }, { context });
  });
  await mod.evaluate();
  const mint = () => mod.namespace.mint({ connection: {}, wallet: { publicKey: { toBase58: () => "owner" } }, burner: { publicKey: { toBase58: () => "burner" } }, slug: "test", collection: {} });
  return { mint, calls, store, engine: mod.namespace };
}

test("a landed register is reported to the backend, with the reservation id, before the sweep", async () => {
  const x = await engine();
  assert.equal((await x.mint()).index, 1);
  const reports = x.calls.filter((c) => c.landed);
  assert.deepEqual(reports, [{ landed: { reservationId: "reservation" } }]);
  assert.ok(x.calls.indexOf(reports[0]) < x.calls.indexOf("sweep"));
});

test("a 202 (bit not visible yet) is retried a few times, and a failing report never fails the mint", async () => {
  const slow = await engine({ landedStatuses: [202, 202, 200] });
  assert.equal((await slow.mint()).C, "C");
  assert.equal(slow.calls.filter((c) => c.landed).length, 3);
  const never = await engine({ landedStatuses: [202, 202, 202, 202, 202, 202] });
  assert.equal((await never.mint()).C, "C");
  assert.equal(never.calls.filter((c) => c.landed).length, 4); // gives up; the reconciler covers it
  const down = await engine({ landedStatuses: [500] });
  assert.equal((await down.mint()).index, 1);
  const offline = await engine({ throwLanded: true });
  assert.equal((await offline.mint()).index, 1);
  assert.ok(offline.calls.includes("sweep"));
});

// The bridge (nft_bridge.js) with a connected wallet whose every signature is counted.
async function bridge() {
  const signs = [], estimates = [], connects = [], store = new Map();
  const provider = { publicKey: { toBase58: () => "wallet" }, connect: async () => {}, signMessage: async (m) => { signs.push(m); return { signature: new Uint8Array(64) }; } };
  const window = { phantom: { solana: provider }, dispatchEvent() {} };
  const context = vm.createContext({ window, console, TextEncoder, Uint8Array, Event: class {}, localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) } });
  const imports = {
    "@solana/web3.js": { Connection: class {}, PublicKey: class { constructor(s) { this.s = s; } toBase58() { return this.s; } } },
    "@iqlabs-official/solana-sdk": { setRpcUrl() {} },
    "./wallets.js?v=2": { listWallets: () => [], connectWallet: async (options) => { connects.push(options); return options.walletId || "wallet"; }, getWalletProvider: () => provider, disconnectWallet() {}, solflareBrowseUrl: () => null },
    "./burner.js": { deriveBurner: async (sign) => { await sign("derive"); return { publicKey: { toBase58: () => "burner-pk" } }; } },
    "./nft.js?v=10": { estimateMintCost: async (col, conn, burner) => { estimates.push(burner ? burner.publicKey.toBase58() : null); return 7; }, mint: async ({ burner }) => ({ burner: burner.publicKey.toBase58() }), nftApi: () => "" },
    "./nft_create.js?v=8": { deploy: async () => {}, pendingDeploy: () => null },
    "./image_compress.js?v=1": { compressImage: () => {} },
    "./nft_asset.js?v=4": { readAsset() {}, readInscription() {}, viewAssetViaGateway() {}, gatewayMetadata() {} },
  };
  const mod = new vm.SourceTextModule(codein("nft_bridge.js"), { context });
  await mod.link((name) => {
    if (name === "./nft_net.js?v=2") return new vm.SourceTextModule(codein("nft_net.js"), { context });
    const values = imports[name];
    assert.ok(values, "unexpected " + name);
    return new vm.SyntheticModule(Object.keys(values), function () { for (const [k, v] of Object.entries(values)) this.setExport(k, v); }, { context });
  });
  await mod.evaluate();
  return { iqNft: window.iqNft, signs, estimates, connects, provider, store };
}

test("opening a collection never asks the wallet to sign: the estimate stays silent until the user mints", async () => {
  const b = await bridge();
  assert.equal(b.iqNft.connected(), "wallet");
  assert.equal(await b.iqNft.estimateMintCost({}), 7);
  assert.deepEqual(b.signs, []); // no burner derivation on page entry
  assert.deepEqual(b.estimates, [null]); // no remembered burner yet: the generic budget
  assert.deepEqual(await b.iqNft.mint({ slug: "x" }), { burner: "burner-pk" });
  assert.equal(b.signs.length, 1); // the one derivation happens on MINT
  assert.equal(await b.iqNft.estimateMintCost({}), 7);
  assert.equal(b.signs.length, 1); // still silent afterwards...
  assert.deepEqual(b.estimates, [null, "burner-pk"]); // ...and now rent-aware through the remembered burner key
});

test('explicit NFT wallet selection reaches the shared connector even when already connected',async()=>{
 const b=await bridge();assert.equal(await b.iqNft.connect('Jupiter'),'Jupiter');assert.equal(b.connects.length,1);assert.equal(b.connects[0].walletId,'Jupiter');
});
test('account change during legacy message approval cannot persist a burner under the new owner',async()=>{
 const b=await bridge();b.provider.signMessage=async()=>{b.provider.publicKey={toBase58:()=> 'another-wallet'};return{signature:new Uint8Array(64)};};
 await assert.rejects(b.iqNft.mint({collection:{},slug:'test'}),/Wallet changed while signing/);assert.equal(b.store.has('iq6900_nft_burner_another-wallet'),false);
});

test('successful mint with failed refund retains a separate public recovery record and blocks duplicate minting',async()=>{
 const f=await engine({refundFailure:true});const result=await f.mint();assert.equal(result.index,1);assert.equal(result.refundPending,true);assert.equal(f.engine.pendingMint('test'),null);assert.equal(f.engine.pendingRefund('owner').burner,'burner');assert.doesNotMatch(JSON.stringify([...f.store]),/secretKey|"asset"/);const calls=f.calls.length;await assert.rejects(f.mint(),/previous mint/);assert.equal(f.calls.length,calls);
});


test('owner API errors and malformed responses are not reported as an empty wallet',async()=>{
 const unavailable=await engine({ownerStatus:503,ownerBody:{error:'unavailable'}});await assert.rejects(unavailable.engine.getHeld('owner'),/Could not load/);
 const malformed=await engine({ownerBody:{}});await assert.rejects(malformed.engine.getHeld('owner'),/Could not load/);
 const empty=await engine();assert.equal((await empty.engine.getHeld('owner')).length,0);
});
