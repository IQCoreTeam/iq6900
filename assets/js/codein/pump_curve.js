// Value of a pump.fun coin that is still on its bonding curve, read straight
// from the curve account. Chart indexers only list a coin once it graduates to
// a DEX pool, and pump.fun's own API refuses other origins, so the chain is the
// one source a browser can read for a fresh launch.
import { PublicKey } from "@solana/web3.js";

const PUMP_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const SEED = new TextEncoder().encode("bonding-curve");

// -> [{ mint, priceSol, mcapSol }] for the mints with a live curve. A graduated
// curve (complete, reserves drained), a non-pump mint, or a malformed address
// is simply absent.
export async function readCurves(connection, mints) {
  const keyed = [];
  mints.forEach((mint) => {
    try { keyed.push({ mint, pda: PublicKey.findProgramAddressSync([SEED, new PublicKey(mint).toBytes()], PUMP_ID)[0] }); }
    catch (e) { /* not a solana address: anyone can write a registry row */ }
  });
  const out = [];
  // 10 per call: the default public RPC rejects getMultipleAccounts above 10
  // keys with a 403 (measured), well under the protocol's own cap of 100.
  for (let i = 0; i < keyed.length; i += 10) {
    const batch = keyed.slice(i, i + 10);
    const accts = await connection.getMultipleAccountsInfo(batch.map((k) => k.pda));
    accts.forEach((a, n) => {
      if (!a || a.data.length < 49) return;
      // Layout after the 8-byte discriminator: virtual token reserves, virtual
      // sol reserves, real token, real sol, total supply (u64 LE each), then
      // the complete flag. DataView, not Buffer.readBigUInt64LE: the browser
      // Buffer polyfill does not implement the BigInt readers.
      const dv = new DataView(a.data.buffer, a.data.byteOffset, a.data.byteLength);
      const vTok = Number(dv.getBigUint64(8, true));
      const vSol = Number(dv.getBigUint64(16, true));
      const supply = Number(dv.getBigUint64(40, true));
      if (a.data[48] === 1 || !vTok || !vSol) return;
      const priceSol = (vSol / 1e9) / (vTok / 1e6); // sol per whole token (6 decimals)
      out.push({ mint: batch[n].mint, priceSol, mcapSol: priceSol * (supply / 1e6) });
    });
  }
  return out;
}
