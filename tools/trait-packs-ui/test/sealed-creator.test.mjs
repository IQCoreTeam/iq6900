import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { createPackDraft } from "../../../assets/js/sections/pages/nft_pack_creator.js";
const html = await readFile(
  new URL("../../../assets/html/sections/nft_studio.html", import.meta.url),
  "utf8",
);
test("sealed creator mode requires explicit configuration and retains ordinary defaults", async (t) => {
  for (const configured of [false, true])
    await t.test(String(configured), (t) => {
      const dom = new JSDOM(html, {
          url: "http://127.0.0.1:4592/?menu=nft-create",
        }),
        w = dom.window,
        old = {
          window: globalThis.window,
          document: globalThis.document,
          location: globalThis.location,
          localStorage: globalThis.localStorage,
        };
      w.iqNft = { connected: () => "11111111111111111111111111111111" };
      w.iqPackCreatorConfig = {
        sealedPacks: configured,
        gateway: w.location.origin,
      };
      Object.assign(globalThis, {
        window: w,
        document: w.document,
        location: w.location,
        localStorage: w.localStorage,
      });
      const root = w.document.querySelector("#nfts"),
        model = createPackDraft(root, { onChange() {} });
      t.after(() => {
        model.dispose();
        Object.assign(globalThis, old);
        w.close();
      });
      model.setSlug("sealed-review");
      assert.equal(
        root.querySelector("#nfts_pack_sealed_options").hidden,
        !configured,
      );
      assert.equal(root.querySelector("#nfts_pack_sealed").checked, false);
      if (configured) {
        root.querySelector("#nfts_pack_sealed").checked = true;
        const supply = root.querySelector("#nfts_pack_sealed_supply");
        supply.value = "3";
        supply.dispatchEvent(new w.Event("change"));
        assert.equal(
          root.querySelector("#nfts_pack_sealed_fields").hidden,
          false,
        );
        assert.match(
          root.querySelector("#nfts_pack_sealed_cost").textContent,
          /0.244 SOL/,
        );
        assert.match(
          root.querySelector("#nfts_pack_sealed_cost").textContent,
          /collateral/,
        );
        const saved = JSON.parse(
          w.localStorage.getItem("iqstudio:pack-recovery:sealed-review"),
        );
        assert.equal(saved.sealedRelease.supply, "3");
      }
    });
});
