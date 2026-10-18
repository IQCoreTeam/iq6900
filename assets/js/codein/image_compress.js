// image_compress.js - the single image-compression step for every creator path
// (generate / hand-craft / upload). Uses the squoosh codecs directly (@jsquash
// resize + webp, the same wasm squoosh.app runs), so a creator's art is shrunk
// to a small webp before it is uploaded to Arweave and inscribed on mint, which
// is what keeps each buyer's inscription cheap.
//
// Input is already-decoded pixels ({data, width, height}: a canvas ImageData in
// the browser, or a jSquash-decoded image in a node harness). Decoding a File is
// DOM work and stays with the caller; this module only does the squoosh part:
// optional downscale to a max edge, then webp encode at a quality.
import resize from "@jsquash/resize";
import { encode as encodeWebp } from "@jsquash/webp";

export async function compressImage(imageData, { maxEdge = 512, quality = 80 } = {}) {
  let img = imageData;
  const longest = Math.max(img.width, img.height);
  if (longest > maxEdge) {
    const scale = maxEdge / longest;
    img = await resize(img, { width: Math.round(img.width * scale), height: Math.round(img.height * scale) });
  }
  const buf = await encodeWebp(img, { quality });
  return { bytes: new Uint8Array(buf), mime: "image/webp" };
}
