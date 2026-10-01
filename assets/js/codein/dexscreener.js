// The DexScreener half of a chain adapter's `market`: price source + chart
// embed for any chain DexScreener indexes (slug = its chainId, e.g. "solana",
// "robinhood"). Each adapter spreads this and adds its own launchpad trade
// link. enrich returns one {mint,pair...} row per mint (deepest-liquidity pair
// wins); a mint with no indexed pool is simply absent.
export function dexscreenerMarket(chain) {
  const site = "https://dexscreener.com/" + chain + "/";
  return {
    attribution: "via dexscreener",
    siteLabel: "OPEN ON DEXSCREENER",
    embedUrl: (pair) => site + pair.pairAddress + "?embed=1&theme=dark&trades=0&info=0",
    siteUrl: (pair) => pair.url || (site + pair.pairAddress),
    enrich: async (mints) => {
      const out = [];
      for (let i = 0; i < mints.length; i += 30) {
        const batch = mints.slice(i, i + 30); // tokens/v1 caps at 30 addresses
        try {
          const res = await fetch("https://api.dexscreener.com/tokens/v1/" + chain + "/" + batch.join(","));
          if (!res.ok) continue;
          const pairs = await res.json();
          (Array.isArray(pairs) ? pairs : []).forEach((p) => {
            const addr = p.baseToken && p.baseToken.address;
            if (!addr) return;
            // Hand the row back under the caller's own string: evm addresses
            // come back checksummed whatever casing was asked for.
            const mint = batch.find((m) => m === addr) || batch.find((m) => m.toLowerCase() === addr.toLowerCase());
            if (!mint) return;
            const liq = (p.liquidity && p.liquidity.usd) || 0;
            const prev = out.find((x) => x.mint === mint);
            if (prev && liq < prev.liq) return; // deepest-liquidity pair wins
            const pc = p.priceChange || {};
            const row = { mint: mint, liq: liq, pairAddress: p.pairAddress, url: p.url,
              priceUsd: p.priceUsd, chg24: pc.h24 != null ? Number(pc.h24) : null,
              mcap: p.marketCap, vol24: p.volume && p.volume.h24, icon: p.info && p.info.imageUrl };
            if (prev) Object.assign(prev, row); else out.push(row);
          });
        } catch (e) { /* leave this batch out */ }
      }
      return out;
    },
  };
}
