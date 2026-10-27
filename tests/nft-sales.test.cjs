const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const jquery = require("jquery");
async function setup(t, fetchRecent) {
  const dom = new JSDOM(
    fs.readFileSync(
      path.join(__dirname, "../assets/html/sections/nft_launch.html"),
      "utf8",
    ),
    { url: "http://127.0.0.1/?menu=nft", runScripts: "outside-only" },
  );
  t.after(() => dom.window.close());
  const w = dom.window;
  w.$ = w.jQuery = jquery(w);
  const calls = [];
  w.iqNft = {
    getRecent: async (slug, limit) => {
      calls.push({ slug, limit });
      return fetchRecent(slug);
    },
    imgUrl: (sig) => "http://127.0.0.1/image/" + sig,
  };
  w.eval(
    fs.readFileSync(
      path.join(__dirname, "../assets/js/sections/pages/nft_launch.js"),
      "utf8",
    ),
  );
  return { w, calls };
}
const collection = {
  slug: "local",
  name: "Collection",
  maxSupply: 2,
  priceLamports: 1000000,
};
test("sales and mints use their own lamport prices, ordered by event time with no extra price fetch", async (t) => {
  const { w, calls } = await setup(t, () => [
    { kind: "mint", index: 1, asset: "mint", registeredAt: 10 },
    {
      kind: "sale",
      index: 1,
      asset: "mint",
      price: 1500000000,
      registeredAt: 20,
    },
  ]);
  await w.$.nft_launch.renderMintedFeed([collection]);
  const rows = [...w.document.querySelectorAll(".fr")];
  assert.match(rows[0].textContent, /SALE 1.50 SOL/);
  assert.match(rows[1].textContent, /MINT 0.001 SOL/);
  assert.deepEqual(calls, [{ slug: "local", limit: 100 }]);
});
test("legacy recent rows without kind remain mints and single registries show free mint", async (t) => {
  const { w } = await setup(t, () => [
    { index: 1, asset: "mint", registeredAt: 10 },
  ]);
  await w.$.nft_launch.renderMintedFeed([{ ...collection, maxSupply: 0 }]);
  assert.match(w.$("#nftl_minted_rows").text(), /MINT free/);
});
test("a failed collection recent read does not hide another collection sale", async (t) => {
  const { w } = await setup(t, (slug) => {
    if (slug === "bad") throw Error("offline");
    return [
      {
        kind: "sale",
        index: 1,
        asset: "mint",
        price: 250000000,
        registeredAt: 20,
      },
    ];
  });
  await w.$.nft_launch.renderMintedFeed([
    { ...collection, slug: "bad" },
    collection,
  ]);
  assert.equal(w.document.querySelectorAll(".fr").length, 1);
  assert.match(w.$("#nftl_minted_rows").text(), /SALE 0.25 SOL/);
});
test("collection names remain inert text and clicking sale opens the existing viewer", async (t) => {
  const { w } = await setup(t, () => [
    { kind: "sale", index: 1, asset: "mint", price: 1e9, registeredAt: 20 },
  ]);
  let opened;
  w.$.nft_launch.openViewer = (asset, slug) => {
    opened = { asset, slug };
  };
  await w.$.nft_launch.renderMintedFeed([
    { ...collection, name: "<img src=x onerror=alert(1)>" },
  ]);
  assert.equal(w.document.querySelector(".fnt img"), null);
  w.$(".fr").trigger("click");
  assert.deepEqual(opened, { asset: "mint", slug: "local" });
});
test("feed retains returned events beyond the old 16-row cap, newest first", async (t) => {
  const { w, calls } = await setup(t, () =>
    Array.from({ length: 20 }, (_, i) => ({
      kind: "sale",
      index: i + 1,
      asset: "mint" + i,
      price: 1e9,
      registeredAt: i,
    })),
  );
  await w.$.nft_launch.renderMintedFeed([collection]);
  const rows = [...w.document.querySelectorAll(".fr")];
  assert.equal(rows.length, 20);
  assert.equal(rows[0].querySelector(".fnt").textContent, "Collection #20");
  assert.equal(rows.at(-1).querySelector(".fnt").textContent, "Collection #1");
  assert.deepEqual(calls, [{ slug: "local", limit: 100 }]);
});

test("feed keeps its 300-row display bound across 100-row collection reads", async (t) => {
  const { w, calls } = await setup(t, (slug) =>
    Array.from({ length: 100 }, (_, i) => ({
      kind: "mint",
      index: i + 1,
      asset: slug + "-" + i,
      registeredAt: Number(slug) * 100 + i,
    })),
  );
  const cols = Array.from({ length: 4 }, (_, i) => ({ ...collection, slug: String(i) }));
  const opened = [];
  w.$.nft_launch.openViewer = (asset, slug) => opened.push({ asset, slug });
  await w.$.nft_launch.renderMintedFeed(cols);
  assert.equal(w.document.querySelectorAll(".fr").length, 300);
  assert.deepEqual(calls, cols.map((c) => ({ slug: c.slug, limit: 100 })));
  w.$(".fr").first().trigger("click");
  w.$(".fr").last().trigger("click");
  assert.deepEqual(opened, [{ asset: "3-99", slug: "3" }, { asset: "1-0", slug: "1" }]);
});
