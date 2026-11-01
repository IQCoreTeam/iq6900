import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
test("sealed venue code is a separate canonical lazy bundle", async () => {
  assert(process.env.IQ_PACK_CLIENT_ROOT);
  const canonical = await readFile(
      path.join(process.env.IQ_PACK_CLIENT_ROOT, "dist/sealed.js"),
    ),
    served = await readFile(
      new URL("../../../assets/sealed-client.js", import.meta.url),
    ),
    ordinary = await readFile(
      new URL("../../../assets/pack-client.js", import.meta.url),
      "utf8",
    );
  assert.equal(
    createHash("sha256").update(served).digest("hex"),
    createHash("sha256").update(canonical).digest("hex"),
  );
  assert.doesNotMatch(ordinary, /TENSOR_MARKETPLACE_PROGRAM_ADDRESS/);
  assert.match(served.toString(), /TENSOR_MARKETPLACE_PROGRAM_ADDRESS/);
});
