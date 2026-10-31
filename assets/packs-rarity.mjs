// Shared launchpad palette. A creator tier is a label, not a marketplace rank.
export const TIER_COLORS = Object.freeze({ common: '#e8e4d6', rare: '#5aa9ff', epic: '#c77dff', legendary: '#ffb347' });

export function initialPoolShares(definitions) {
  if (!Array.isArray(definitions) || !definitions.length || definitions.length > 16) throw Error('Expected 1–16 catalog definitions');
  const ids = new Set();
  let total = 0;
  for (const definition of definitions) {
    if (!Number.isInteger(definition.id) || ids.has(definition.id) || !Number.isSafeInteger(definition.initialSupply) || definition.initialSupply < 0 || definition.initialSupply > 1_000_000) throw Error('Invalid initial supply');
    ids.add(definition.id); total += definition.initialSupply;
  }
  if(total===0)throw Error('An empty catalog has no draw shares');
  return definitions.map(definition => ({ id: definition.id, initialSupply: definition.initialSupply, perDrawShare: definition.initialSupply / total }));
}
