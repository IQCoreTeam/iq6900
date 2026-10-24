const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const MAIN = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  DEV = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
async function load(fetch) {
  const context = vm.createContext({
    fetch,
    AbortController,
    setTimeout,
    clearTimeout,
    console,
  });
  const transport = new vm.SourceTextModule(
    fs.readFileSync(
      path.join(__dirname, "../assets/js/codein/gateway_notify.js"),
      "utf8",
    ),
    { context },
  );
  await transport.link(() => {
    throw Error("unexpected transport import");
  });
  await transport.evaluate();
  const mod = new vm.SourceTextModule(
    fs.readFileSync(
      path.join(__dirname, "../assets/js/codein/nft_notify.js"),
      "utf8",
    ),
    { context },
  );
  await mod.link((name) => {
    if (name.includes("gateway_notify")) return transport;
    assert.equal(name, "./feed.js");
    return new vm.SyntheticModule(
      ["feedTablePda"],
      function () {
        this.setExport("feedTablePda", { toBase58: () => "feed-table" });
      },
      { context },
    );
  });
  await mod.evaluate();
  return {
    notify: mod.namespace.notifyNftFeedRow,
    transport: transport.namespace.notifyGateways,
  };
}
for (const [genesis, host] of [
  [DEV, "https://dev-gateway.iqlabs.dev"],
  [MAIN, "https://gateway.iqlabs.dev"],
])
  test(`notify follows actual genesis, not RPC hostname: ${host}`, async () => {
    const calls = [];
    const { notify } = await load(async (url, init) => {
      calls.push({ url, payload: JSON.parse(init.body) });
      return { ok: true };
    });
    let genesisReads = 0,
      statusReads = 0;
    const conn = {
      rpcEndpoint: "https://custom.example/rpc",
      getGenesisHash: async () => {
        genesisReads++;
        return genesis;
      },
      getSignatureStatuses: async () => {
        statusReads++;
        return { value: [{ confirmationStatus: "confirmed", err: null }] };
      },
    };
    for (const sig of ["C", "logo"])
      assert.equal(
        await notify(
          conn,
          sig,
          { kind: "image", body: "data:image/png;base64,AA==", who: "owner" },
          "burner",
        ),
        true,
      );
    assert.equal(genesisReads, 1);
    assert.equal(statusReads, 2);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((c) => c.url === host + "/table/feed-table/notify"));
    assert.equal(calls[0].payload.signer, "owner");
    assert.equal(calls[0].payload.row.__signer, "burner");
  });
for (const status of [
  null,
  { confirmationStatus: "processed", err: null },
  { confirmationStatus: "confirmed", err: { InstructionError: [0, "failed"] } },
])
  test(`unconfirmed or failed writes never warm cache: ${JSON.stringify(status)}`, async () => {
    let posts = 0;
    const { notify } = await load(async () => {
      posts++;
      return { ok: true };
    });
    assert.equal(
      await notify(
        {
          getGenesisHash: async () => DEV,
          getSignatureStatuses: async () => ({ value: [status] }),
        },
        "C",
        { who: "owner" },
        "burner",
      ),
      false,
    );
    assert.equal(posts, 0);
  });
test("unknown/local genesis skips cache notification instead of guessing mainnet", async () => {
  let posts = 0;
  const { notify } = await load(async () => {
    posts++;
    return { ok: true };
  });
  assert.equal(
    await notify(
      {
        getGenesisHash: async () => "local-genesis",
        getSignatureStatuses: async () => {
          throw Error("unexpected status call");
        },
      },
      "C",
      { who: "owner" },
      "burner",
    ),
    false,
  );
  assert.equal(posts, 0);
});
test("gateway outage returns false without failing the landed inscription", async () => {
  const { notify } = await load(async () => {
    throw Error("offline");
  });
  assert.equal(
    await notify(
      {
        getGenesisHash: async () => DEV,
        getSignatureStatuses: async () => ({
          value: [{ confirmationStatus: "finalized", err: null }],
        }),
      },
      "C",
      { who: "owner" },
      "burner",
    ),
    false,
  );
});
test("genesis lookup failure is best effort and does not poison later attempts", async () => {
  let count = 0,
    posts = 0;
  const { notify } = await load(async () => {
    posts++;
    return { ok: true };
  });
  const conn = {
    getGenesisHash: async () => {
      if (++count === 1) throw Error("offline");
      return DEV;
    },
    getSignatureStatuses: async () => ({
      value: [{ confirmationStatus: "confirmed", err: null }],
    }),
  };
  assert.equal(await notify(conn, "C", { who: "owner" }, "burner"), false);
  assert.equal(await notify(conn, "C", { who: "owner" }, "burner"), true);
  assert.equal(count, 2);
  assert.equal(posts, 1);
});
test("shared transport keeps fallback order, removes duplicate endpoints and never polls", async () => {
  const calls = [];
  const { transport } = await load(async (url, init) => {
    calls.push(url);
    assert.equal(init.redirect, "error");
    return { ok: url.endsWith("/ok") };
  });
  assert.equal(
    await transport(
      [
        "https://first/no",
        "https://first/no",
        "https://second/ok",
        "https://third/no",
      ],
      { txSignature: "C" },
    ),
    true,
  );
  assert.deepEqual(calls, ["https://first/no", "https://second/ok"]);
});
