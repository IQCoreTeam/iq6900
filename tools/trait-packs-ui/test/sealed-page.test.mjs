import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
const until = async (f) => {
  for (let i = 0; i < 100; i++) {
    if (f()) return;
    await new Promise(setImmediate);
  }
  throw Error("Sealed UI state did not arrive");
};
test("actual sealed page preserves separate checkout, holder actions and wallet-change isolation", async (t) => {
  const html = await readFile(
      new URL("../../../assets/html/sections/nft_packs.html", import.meta.url),
      "utf8",
    ),
    dom = new JSDOM('<main id="main_section">' + html + "</main>", {
      url: "http://127.0.0.1/?menu=packs&collection=11111111111111111111111111111111",
    }),
    w = dom.window;
  const previous = Object.fromEntries(
    [
      "window",
      "document",
      "location",
      "MutationObserver",
      "CustomEvent",
      "fetch",
    ].map((k) => [k, globalThis[k]]),
  );
  Object.assign(globalThis, {
    window: w,
    document: w.document,
    location: w.location,
    MutationObserver: w.MutationObserver,
    CustomEvent: w.CustomEvent,
  });
  const config = {
    program: "22222222222222222222222222222222",
    collection: "11111111111111111111111111111111",
    chain: "solana:devnet",
    rpc: "https://rpc.example",
    registry: {},
    pendingPurchases: {},
    windowRequests: false,
  };
  const address = "33333333333333333333333333333333",
    account = { address },
    data = {
      ...config,
      collectionAddress: config.collection,
      name: "Sealed edition",
      unminted: 7,
      sealed: 1,
      opened: 0,
      pagination: { nextBefore: null },
      packCollection: "44444444444444444444444444444444",
      packs: [
        {
          asset: "55555555555555555555555555555555",
          serial: 0,
          owner: address,
          opened: false,
        },
      ],
    };
  data.packs.push({...data.packs[0], asset: "66666666666666666666666666666666", serial: 1});
  data.sealed = 2;
  let opened = 0,
    release,
    notifyFromHost,
    notificationReply;
  globalThis.__sealedTestSDK = {
    Connection: class {},
    createSealedPackClient: (options) => {
      notifyFromHost = options.notify;
      return {
        open: async () => {
          opened++;
          await new Promise((r) => (release = r));
        },
        reconcilePurchase: async () => {},
      };
    },
    mountPackWalletUI(root, { purchaseRoot }) {
      const connect = w.document.createElement("button");
      connect.textContent = "Connect wallet";
      connect.onclick = () =>
        root.dispatchEvent(
          new w.CustomEvent("iqpacks:wallet", {
            detail: { wallet: {}, account },
          }),
        );
      root.append(connect);
      purchaseRoot.textContent = "0.105 SOL · Buy pack";
      return () => {};
    },
    readTensorListings: async () => { throw Error("Resale must stay disabled"); },
  };
  const traitAddresses = ["7", "8", "9", "A"].map(char=>char.repeat(32));
  const resultState = {...config,collectionAddress:config.collection,
    packs:[{id:0,address:"confirmed-ticket",owner:address,status:"settled",epoch:0,sequence:0,traitAddresses}],
    traits:traitAddresses.map((address,index)=>({address,definition:0,slot:0,name:"Saved trait " + (index+1),image:"/trait-" + index + ".png"})),
    stock:[{id:0,remaining:4,creatorTier:"common"}],receipts:[],avatar:{exists:false},pagination:{before:1,nextBefore:null}};
  globalThis.__sealedRevealUpdates = [];
  const reads = [];
  globalThis.fetch = async (url, options) => {
    reads.push(new URL(url));
    return {
      ok: true,
      json: async () => (options?.method === "POST" ? notificationReply : new URL(url).pathname.endsWith("/state") ? resultState : data),
    };
  };
  const folder = await mkdtemp(path.join(tmpdir(), "iq-sealed-ui-"));
  t.after(async () => {
    delete globalThis.__sealedTestSDK;
    delete globalThis.__sealedRevealUpdates;
    Object.assign(globalThis, previous);
    w.close();
    await rm(folder, { recursive: true, force: true });
  });
  const sdk =
    "data:text/javascript;base64," +
    Buffer.from(
      "const client=globalThis.__sealedTestSDK;export const Connection=client.Connection,createSealedPackClient=client.createSealedPackClient,mountPackWalletUI=client.mountPackWalletUI,readTensorListings=client.readTensorListings;",
    ).toString("base64");
  const reveal =
    "data:text/javascript;base64," +
    Buffer.from(
      "export const createPackOpening=()=>({update(value){globalThis.__sealedRevealUpdates.push(value);},dispose(){}});",
    ).toString("base64");
  const appearance = new URL(
    "../../../assets/packs-appearance.mjs",
    import.meta.url,
  ).href;
  const transport = new URL(
    "../../../assets/js/sections/pages/pack-transport.mjs",
    import.meta.url,
  ).href;
  let rewardsModule = await readFile(new URL("../../../assets/js/sections/pages/nft_packs.js",import.meta.url),"utf8");
  for (const file of ["packs-appearance.mjs","nft-market-links.mjs","packs-rarity.mjs"])
    rewardsModule = rewardsModule.replace("'/" + file + "'", JSON.stringify(new URL("../../../assets/"+file,import.meta.url).href));
  await writeFile(path.join(folder,"rewards-page.mjs"),rewardsModule);
  let source = await readFile(
    new URL(
      "../../../assets/js/sections/pages/nft_sealed_packs.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  source = source
    .replace('"/sealed-client.js"', JSON.stringify(sdk))
    .replace('"./pack-transport.mjs"', JSON.stringify(transport))
    .replaceAll('"./nft_packs.js"', JSON.stringify(pathToFileURL(path.join(folder,"rewards-page.mjs")).href));
  source = source
    .replace('"/packs-reveal.js"', JSON.stringify(reveal))
    .replace('"/packs-appearance.mjs"', JSON.stringify(appearance));
  await writeFile(path.join(folder, "page.mjs"), source);
  const { mountSealedPackPage } = await import(
    pathToFileURL(path.join(folder, "page.mjs")).href
  );
  await mountSealedPackPage(w.document.querySelector("#nftp"), config);
  assert.match(
    w.document.querySelector("#nftp-checkout").textContent,
    /0.105 SOL/,
  );
  assert.match(
    w.document.querySelector(".opening-window").textContent,
    /Connect your wallet/,
  );
  const wardrobe=w.document.querySelector('.wardrobe-link');
  const wardrobeURL=new URL(wardrobe.href);
  assert.equal(wardrobe.textContent,'Your traits');
  assert.ok(wardrobe.closest('.packs-nav'),'Wardrobe must be reachable from the top navigation');
  assert.equal(wardrobeURL.searchParams.get('view'),'wardrobe');
  assert.equal(wardrobeURL.searchParams.get('collection'),config.collection);
  assert.ok(
    w.document.querySelector(".pack-workspace > .library-opening"),
    "reveal keeps the incumbent full-width inner stage",
  );
  const button = (name) =>
    [...w.document.querySelectorAll("button")].find(
      (x) => !x.closest("[hidden]") && (x.textContent === name || x.getAttribute("aria-label") === name),
    );
  button("Connect wallet").click();
  await until(() => button("Open pack"));
  assert.equal(w.document.querySelector(".owned-pack-count").textContent, "×2");
  assert.equal(w.document.querySelectorAll('.owned-pack-art[aria-label="Open pack"]').length, 1);
  assert.equal(w.document.querySelector(".sealed-history").open, false);
  assert.equal(button("List pack"), undefined);
  assert.equal(w.document.querySelector('input[placeholder="Asking price in SOL"]'), null);
  assert.equal(w.document.querySelector("#nftp-checkout").hidden, false,
    "Existing ownership must not hide checkout on connection");
  assert.equal(w.document.querySelector(".pack-workspace").hidden, true);
  data.pagination.nextBefore = 1;
  button("Refresh").click();
  await until(
    () =>
      !w.document.querySelector(".pack-wallet-controls").hasAttribute("inert"),
  );
  button("Earlier packs").click();
  await until(() => reads.at(-1).searchParams.get("before") === "1");
  await until(
    () =>
      !w.document.querySelector(".pack-wallet-controls").hasAttribute("inert"),
  );
  w.document.querySelector(".pack-wallet-controls").dispatchEvent(
    new w.CustomEvent("iqpacks:purchase", {
      detail: { signature: "confirmed" },
    }),
  );
  await until(() => !reads.at(-1).searchParams.has("before"));
  await until(() => w.document.querySelector("#nftp-checkout").hidden);
  assert.ok(button("Buy more packs"));
  button("Buy more packs").click();
  assert.equal(w.document.querySelector("#nftp-checkout").hidden, false);
  assert.ok(button("Open pack"), "Buying more must retain owned packs");
  button("Earlier packs").click();
  await until(() => reads.at(-1).searchParams.get("before") === "1");
  await until(
    () =>
      !w.document.querySelector(".pack-wallet-controls").hasAttribute("inert"),
  );
  button("Connect wallet").click();
  await until(() => !reads.at(-1).searchParams.has("before"));
  assert.equal(button("Verify randomness"), undefined);
  await until(() => button("Open pack"));
  button("Open pack").click();
  button("Open pack").click();
  await until(() => opened === 1);
  assert.equal(
    w.document.querySelector(".pack-wallet-controls").hasAttribute("inert"),
    true,
  );
  w.document.querySelector(".pack-wallet-controls").dispatchEvent(
    new w.CustomEvent("iqpacks:wallet", {
      detail: { wallet: null, account: null },
    }),
  );
  await until(() => !button("Open pack"));
  release();
  await new Promise(setImmediate);
  assert.doesNotMatch(
    w.document.querySelector(".pack-status").textContent,
    /Preparing randomness/,
  );
  data.packs[1].owner = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
  data.packs[0] = {
    ...data.packs[0],
    opened: true,
    opener: address,
    status: "preparing",
    epoch: 0,
    ticket: 0,
  };
  button("Connect wallet").click();
  await until(
    () =>
      w.document.querySelector(".sealed-card p")?.textContent ===
      "Consumed on opening",
  );
  assert.equal(button("Verify randomness"), undefined);
  assert.doesNotMatch(w.document.querySelector(".sealed-grid").textContent, /No packs/);
  data.packs[0].status = "ready";
  button("Refresh").click();
  await until(() => button("Verify randomness"));
  assert.ok(button("View items"));
  assert.equal(button("Show opening"), undefined);
  await until(
    () =>
      !w.document.querySelector(".pack-wallet-controls").hasAttribute("inert"),
  );
  await new Promise(setImmediate);
  button("View items").click();
  await until(()=>w.document.querySelectorAll(".pack-history-items img").length===4);
  assert.deepEqual([...w.document.querySelectorAll(".pack-history-items figcaption")].map(x=>x.textContent),
    ["Saved trait 1","Saved trait 2","Saved trait 3","Saved trait 4"]);
  assert.equal(globalThis.__sealedRevealUpdates.some(value=>value.cards.length===4),false,
    "History results must not enter the opening animation");
  await until(()=>!w.document.querySelector(".pack-wallet-controls").hasAttribute("inert"));
  button("Hide items").click();
  await until(()=>!w.document.querySelector(".pack-history-items"));
  await until(()=>!w.document.querySelector(".pack-wallet-controls").hasAttribute("inert"));
  notificationReply = { accepted: 0 };
  await assert.rejects(() => notifyFromHost(["asset"]), /not accepted/);
  notificationReply = { accepted: 1 };
  assert.equal((await notifyFromHost(["asset"])).accepted, 1);
});
