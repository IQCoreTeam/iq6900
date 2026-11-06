// Match the launchpad's existing Magic Eden item links. Public marketplaces use
// mainnet identities; never send a devnet/localnet asset to a mainnet item page.
export function solanaMarketUrl(asset, chain) {
  if (chain !== 'solana:mainnet' || typeof asset !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(asset)) return null;
  return 'https://magiceden.io/item-details/' + encodeURIComponent(asset);
}
