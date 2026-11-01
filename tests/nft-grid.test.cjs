const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const jquery = require("jquery");
const tick = () => new Promise(setImmediate);

function mount(t, iqNft) {
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, "../assets/html/sections/nft_launch.html"), "utf8"), { url: "http://127.0.0.1/?menu=nft", runScripts: "outside-only" });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.$ = w.jQuery = jquery(w);
  w.iqNft = { imgUrl: (sig) => "http://127.0.0.1/image/" + sig, ...iqNft };
  w.eval(fs.readFileSync(path.join(__dirname, "../assets/js/sections/pages/nft_launch.js"), "utf8"));
  return w;
}

// A backend of `total` items paged by offset/limit, minted at the given indices.
function pages(total, minted) {
  const calls = [];
  const getItems = async (slug, offset, limit) => {
    calls.push({ slug, offset, limit });
    const items = [];
    for (let i = offset + 1; i <= Math.min(total, offset + limit); i++) {
      const m = minted.includes(i);
      items.push({ index: i, name: "Item " + i, minted: m, asset: m ? "asset" + i : null, owner: m ? "holder" : null, inscriptionSig: m ? "C" + i : null, rarity: null });
    }
    return { hasRarity: false, items, total };
  };
  return { calls, getItems };
}

test("the collection grid loads every item page, so a big drop shows all of its mints", async (t) => {
  const { calls, getItems } = pages(1300, [7, 777, 1234]);
  const w = mount(t, { getItems });
  const col = { slug: "big", name: "Big", maxSupply: 1300 };
  w.$.nft_launch.col = col;
  await w.$.nft_launch.renderGrid("big", col);
  assert.deepEqual(calls.map((c) => [c.offset, c.limit]), [[0, 500], [500, 500], [1000, 500]]);
  assert.equal(w.$("#nftl_grid .it").length, 1300);
  assert.equal(w.$("#nftl_grid .it.rev").length, 3);
  assert.equal(w.$("#nftl_grid .it.rev").last().find(".tag").text(), "#1234");
  w.$.nft_launch.filter = "minted";
  w.$.nft_launch.paintGrid();
  assert.deepEqual(w.$("#nftl_grid .it .tag").map((_, e) => e.textContent).get(), ["#7", "#777", "#1234"]);
});

test("a backend that pages smaller than asked is still walked to the last item", async (t) => {
  const { calls, getItems } = pages(450, [450]);
  const w = mount(t, { getItems: (slug, offset, limit) => getItems(slug, offset, Math.min(limit, 200)) });
  const col = { slug: "capped", maxSupply: 450 };
  w.$.nft_launch.col = col;
  await w.$.nft_launch.renderGrid("capped", col);
  assert.deepEqual(calls.map((c) => c.offset), [0, 200, 400]);
  assert.equal(w.$("#nftl_grid .it").length, 450);
  assert.equal(w.$("#nftl_grid .it.rev .tag").text(), "#450");
});

test("pages that arrive after the user opened another collection are dropped", async (t) => {
  let releaseSlow;
  const slow = pages(600, []), fast = pages(3, [1]);
  const getItems = (slug, offset, limit) => slug !== "slow" ? fast.getItems(slug, offset, limit)
    : offset === 0 ? slow.getItems(slug, offset, limit)
    : new Promise((res) => { releaseSlow = () => res(slow.getItems(slug, offset, limit)); });
  const w = mount(t, { getItems });
  const a = { slug: "slow", maxSupply: 600 }, b = { slug: "fast", maxSupply: 3 };
  w.$.nft_launch.col = a;
  const first = w.$.nft_launch.renderGrid("slow", a);
  for (let i = 0; i < 20 && !releaseSlow; i++) await tick();
  assert.equal(w.$("#nftl_grid .it").length, 500); // first page painted while the second is in flight
  w.$.nft_launch.col = b;
  await w.$.nft_launch.renderGrid("fast", b);
  assert.equal(w.$("#nftl_grid .it").length, 3);
  releaseSlow();
  await first;
  assert.equal(w.$("#nftl_grid .it").length, 3); // the late page never painted over the new collection
});

test("MY NFTS reads the wallet's holdings in one call instead of scanning item pages", async (t) => {
  let itemCalls = 0;
  const w = mount(t, {
    connected: () => "wallet",
    getItems: async () => { itemCalls++; return { items: [] }; },
    getHeld: async (addr) => addr === "wallet" ? [{ slug: "big", collectionName: "Big", index: 1234, name: "Item 1234", asset: "asset1234", inscriptionSig: "C1234", rarity: { rank: 1, tier: "legendary" } }] : [],
  });
  await w.$.nft_launch.renderMine();
  assert.equal(itemCalls, 0);
  assert.equal(w.$("#nftl_mine .mc").length, 1);
  assert.equal(w.$("#nftl_mine .mcount").text(), "1 NFT");
  assert.ok(w.$("#nftl_mine .mc").hasClass("r-legendary"));
  assert.equal(w.$("#nftl_mine .mc img").attr("src"), "http://127.0.0.1/image/C1234");
  assert.equal(w.$("#nftl_mine .mc .msub").text(), "Big");
  assert.match(w.$("#nftl_mine .mrar").text(), /1 LEGENDARY/);
});
