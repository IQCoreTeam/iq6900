const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto, createHash } = require("node:crypto");
async function engine({
  existingC = false,
  failWrite = false,
  notifyOffline = false,
  holdWrite = false,
} = {}) {
  const bytes = Buffer.from([1, 2, 3]);
  const store = new Map([
    [
      "iq6900_nft_mint_test",
      JSON.stringify({
        wallet: "owner",
        burner: "burner",
        funded: true,
        reservationId: "reservation",
        index: 1,
        arweaveId: "image",
        imageSha256: createHash("sha256").update(bytes).digest("hex"),
        imageMime: "image/png",
        name: "Fixture",
        asset: [1],
        ...(existingC ? { C: "prior-C" } : {}),
      }),
    ],
  ]);
  const calls = [];
  let finish;
  const fetch = async (url) => {
    if (String(url).endsWith("/image"))
      return {
        ok: true,
        arrayBuffer: async () =>
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
      };
    return {
      status: 200,
      text: async () =>
        JSON.stringify(
          String(url).includes("/mint")
            ? { status: "confirmed", index: 1 }
            : { name: "Metadata" },
        ),
    };
  };
  const context = vm.createContext({
    fetch,
    console,
    crypto: webcrypto,
    TextEncoder,
    Uint8Array,
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    setTimeout,
    localStorage: {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    },
  });
  const imports = {
    "@solana/web3.js": {
      Keypair: {
        fromSecretKey: () => ({
          publicKey: { toBase58: () => "asset" },
          secretKey: new Uint8Array([1]),
        }),
      },
      PublicKey: class {},
      SystemProgram: {},
      Transaction: class {},
    },
    "@iqlabs-official/solana-sdk": {
      writer: {
        codeIn: async () => {
          calls.push("metadata-write");
          return "M";
        },
      },
    },
    "./nft_notify.js?v=1": {
      notifyNftFeedRow: async (_c, sig, row, burner) => {
        calls.push({ notify: sig, row, burner });
        return !notifyOffline;
      },
    },
    "./inscribe.js?v=9": {
      writeFeedRow: async () => {
        calls.push("C-write");
        if (failWrite) throw Error("failed write");
        if (holdWrite)
          await new Promise((resolve) => {
            finish = resolve;
          });
        return "C";
      },
      topUp: async () => {
        throw Error("unexpected funding");
      },
      sweep: async () => {},
      confirmOrCheck: async () => true,
    },
    "./cost.js?v=6": {
      estimateCost: () => ({ total: 1 }),
      getAccountRent: async () => 0,
    },
  };
  const mod = new vm.SourceTextModule(
    fs.readFileSync(path.join(__dirname, "../assets/js/codein/nft.js"), "utf8"),
    { context },
  );
  await mod.link((name) => {
    if (name === "./nft_net.js?v=1") {
      return new vm.SourceTextModule(
        fs.readFileSync(path.join(__dirname, "../assets/js/codein/nft_net.js"), "utf8"),
        { context },
      );
    }
    const values = imports[name];
    assert.ok(values, "unexpected " + name);
    return new vm.SyntheticModule(
      Object.keys(values),
      function () {
        for (const [k, v] of Object.entries(values)) this.setExport(k, v);
      },
      { context },
    );
  });
  await mod.evaluate();
  const mint = () =>
    mod.namespace.mint({
      connection: {},
      wallet: { publicKey: { toBase58: () => "owner" } },
      burner: { publicKey: { toBase58: () => "burner" } },
      slug: "test",
      collection: {},
    });
  return { mint, calls, finish: () => finish() };
}
test("mint notifies only its new feed image, never raw metadata or registration", async () => {
  const x = await engine();
  const result = await x.mint();
  assert.equal(result.C, "C");
  assert.equal(result.M, "M");
  const notices = x.calls.filter((c) => typeof c === "object");
  assert.equal(notices.length, 1);
  assert.equal(notices[0].notify, "C");
  assert.equal(notices[0].row.who, "owner");
  assert.equal(notices[0].burner, "burner");
  assert.ok(x.calls.indexOf("C-write") < x.calls.indexOf(notices[0]));
});
test("no cache hint is issued before image write returns", async () => {
  const x = await engine({ holdWrite: true });
  const result = x.mint();
  for (let i = 0; i < 30 && !x.calls.includes("C-write"); i++)
    await new Promise((r) => setImmediate(r));
  assert.ok(x.calls.includes("C-write"));
  assert.equal(x.calls.filter((c) => typeof c === "object").length, 0);
  x.finish();
  await result;
  assert.equal(x.calls.filter((c) => typeof c === "object").length, 1);
});
test("failed image write never issues a notification or metadata write", async () => {
  const x = await engine({ failWrite: true });
  await assert.rejects(x.mint(), /failed write/);
  assert.deepEqual(x.calls, ["C-write"]);
});
test("resume reuses C without duplicate cache hints, and an offline notify does not fail a mint", async () => {
  const resume = await engine({ existingC: true });
  await resume.mint();
  assert.equal(resume.calls.filter((c) => typeof c === "object").length, 0);
  const offline = await engine({ notifyOffline: true });
  assert.equal((await offline.mint()).C, "C");
});
test("creator notifies logo/banner feed writes but not manifest, collection metadata or deploy transaction", async () => {
  const calls = [];
  let n = 0;
  const progress = {
    wallet: "owner",
    burner: "burner",
    stagingId: "stage",
    funded: true,
    manifestJson: "{}",
    collectionJson: "{}",
    itemCount: 1,
    collFinal: true,
    collectionSecret: [1],
  };
  const context = vm.createContext({
    console,
    TextEncoder,
    Uint8Array,
    localStorage: {
      getItem: () => JSON.stringify(progress),
      setItem: () => {},
      removeItem: () => {},
    },
  });
  const imports = {
    "./nft_notify.js?v=1": {
      notifyNftFeedRow: async (_c, sig, row) => {
        calls.push({ notify: sig, who: row.who });
        return false;
      },
    },
    "@solana/web3.js": {
      Keypair: {
        fromSecretKey: () => ({ publicKey: { toBase58: () => "collection" } }),
      },
      Transaction: {
        from: () => ({
          recentBlockhash: "local",
          partialSign() {},
          serialize: () => new Uint8Array([1]),
        }),
      },
    },
    "@iqlabs-official/solana-sdk": {
      writer: {
        codeIn: async () => {
          calls.push("raw-metadata");
          return "raw-" + calls.length;
        },
      },
    },
    "./nft.js?v=7": {
      api: async (path) => ({
        status: 200,
        json:
          path === "/creator/deploy"
            ? {
                transaction: "AA==",
                lastValidBlockHeight: 1,
                registry: "registry",
              }
            : {},
      }),
      bytesToBase64: () => "AQID",
      base64ToBytes: () => new Uint8Array([0]),
    },
    "./inscribe.js?v=9": {
      topUp: async () => {
        throw Error("unexpected funding");
      },
      sweep: async () => {},
      confirmOrCheck: async () => true,
      writeFeedRow: async () => "image-" + ++n,
    },
    "./cost.js?v=6": {
      estimateCost: () => ({ total: 1 }),
      getAccountRent: async () => 0,
    },
    "./image_compress.js?v=1": {
      compressImage: async () => ({
        bytes: new Uint8Array([1, 2, 3]),
        mime: "image/png",
      }),
    },
  };
  const mod = new vm.SourceTextModule(
    fs.readFileSync(
      path.join(__dirname, "../assets/js/codein/nft_create.js"),
      "utf8",
    ),
    { context },
  );
  await mod.link((name) => {
    const values = imports[name];
    assert.ok(values, "unexpected " + name);
    return new vm.SyntheticModule(
      Object.keys(values),
      function () {
        for (const [k, v] of Object.entries(values)) this.setExport(k, v);
      },
      { context },
    );
  });
  await mod.evaluate();
  const result = await mod.namespace.deploy({
    connection: { sendRawTransaction: async () => "deploy-tx" },
    wallet: { publicKey: { toBase58: () => "owner" } },
    burner: { publicKey: { toBase58: () => "burner" } },
    spec: { slug: "test", logo: "pixels", banner: "pixels" },
    items: [],
  });
  assert.equal(result.deploySig, "deploy-tx");
  assert.equal(calls.filter((x) => x === "raw-metadata").length, 2);
  assert.deepEqual(
    calls.filter((x) => typeof x === "object").map((x) => x.notify),
    ["image-1", "image-2"],
  );
});
