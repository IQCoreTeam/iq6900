// nft_net.js - THE one place to flip the NFT launchpad between devnet and
// mainnet. Change NET_DEFAULT below (or set localStorage iq6900_nft_net) and the
// RPC, the backend host, the gateway and the explorer cluster all move together,
// so they can never desync (the class of bug that baked a mainnet gateway into
// devnet NFTs). Mirrors the backend's backend/src/networks.ts; keep the two in
// sync when a host changes.
//
// The RPC override (localStorage iq6900_nft_rpc) and backend override
// (iq6900_nft_api) are for pointing at a DIFFERENT endpoint on the SAME network
// (e.g. a local backend, a keyed RPC), not for switching network. Network is
// this one switch.

const PRESETS = {
  devnet: {
    rpc: "https://api.devnet.solana.com",
    api: "https://nft.iqlabs.dev", // the inscription-NFT backend
    gateway: "https://dev-gateway.iqlabs.dev", // serves /img, /token-meta, /view
    explorerCluster: "?cluster=devnet", // solscan needs it on devnet or links 404
  },
  mainnet: {
    rpc: "https://solana-rpc.publicnode.com", // CORS-open, browser-usable mainnet
    api: "https://nft.iqlabs.dev", // TODO: mainnet backend host at go-live
    gateway: "https://gateway.iqlabs.dev",
    explorerCluster: "",
  },
};

// Flip this to "mainnet" at go-live. A localStorage override wins for dev testing.
const NET_DEFAULT = "devnet";
const NET_KEY = "iq6900_nft_net";

export function net() {
  try {
    const v = localStorage.getItem(NET_KEY);
    return v && PRESETS[v] ? v : NET_DEFAULT;
  } catch (e) {
    return NET_DEFAULT;
  }
}
export function preset() {
  return PRESETS[net()];
}
export function setNet(name) {
  try {
    name && PRESETS[name] ? localStorage.setItem(NET_KEY, name) : localStorage.removeItem(NET_KEY);
  } catch (e) {}
}
export const NET_PRESETS = PRESETS;
