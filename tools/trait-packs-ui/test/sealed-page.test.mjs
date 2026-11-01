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
  let opened = 0,
    release;
  globalThis.__sealedTestSDK = {
    Connection: class {},
    createSealedPackClient: () => ({
      open: async () => {
        opened++;
        await new Promise((r) => (release = r));
      },
      reconcilePurchase: async () => {},
    }),
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
    readTensorListings: async () => [],
  };
  globalThis.fetch = async () => ({ ok: true, json: async () => data });
  const folder = await mkdtemp(path.join(tmpdir(), "iq-sealed-ui-"));
  t.after(async () => {
    delete globalThis.__sealedTestSDK;
    Object.assign(globalThis, previous);
    w.close();
    await rm(folder, { recursive: true, force: true });
  });
  const sdk =
    "data:text/javascript;base64," +
    Buffer.from(
      "const client=globalThis.__sealedTestSDK;export const Connection=client.Connection,createSealedPackClient=client.createSealedPackClient,mountPackWalletUI=client.mountPackWalletUI,readTensorListings=client.readTensorListings;",
    ).toString("base64");
  const transport = new URL(
    "../../../assets/js/sections/pages/pack-transport.mjs",
    import.meta.url,
  ).href;
  let source = await readFile(
    new URL(
      "../../../assets/js/sections/pages/nft_sealed_packs.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  source = source
    .replace('"/sealed-client.js"', JSON.stringify(sdk))
    .replace('"./pack-transport.mjs"', JSON.stringify(transport));
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
  const button = (name) =>
    [...w.document.querySelectorAll("button")].find(
      (x) => x.textContent === name,
    );
  button("Connect wallet").click();
  await until(() => button("Open pack"));
  button("Open pack").click();
  button("Open pack").click();
  await until(() => opened === 1);
  assert.equal(
    w.document.querySelector(".pack-wallet-controls").hasAttribute("inert"),
    true,
  );
  w.document
    .querySelector(".pack-wallet-controls")
    .dispatchEvent(
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
});
