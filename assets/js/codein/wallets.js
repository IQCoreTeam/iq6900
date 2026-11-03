// wallets.js - Solana wallet discovery for the site, in one place.
//
// Every wallet that registers through the Wallet Standard (Jupiter, MetaMask,
// Backpack, Solflare, Phantom, OKX, ...) plus the legacy window.phantom.solana
// and window.solana handles, as one list. A Wallet Standard wallet is wrapped
// into the small provider shape the engines already use (publicKey, connect,
// signMessage, signTransaction, signAndSendTransaction, on/removeListener), so
// inscribe.js, nft.js and token_launch.js do not know which kind they hold.
// Phantom and Backpack keep their own injected providers (the path every
// existing user's burner was derived through); a wallet that is both injected
// and registered is listed once.
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { getWallets, registerMwa, createDefaultAuthorizationCache, Solflare, bs58 } from "./wallet-transports.js?v=1";

const LAST_KEY = "iq6900_solana_wallet"; // the wallet id the user connected last, or "disconnected"
const registry = getWallets();
// Use the official transport's permission, authorization-cache and app-association flow.
// No remote relay is configured. In-wallet browsers keep their own injected wallet.
if (typeof window !== "undefined" && window.isSecureContext &&
    /Android/i.test(navigator.userAgent) && /Chrome\//i.test(navigator.userAgent) &&
    !/EdgA|OPR|SamsungBrowser|Firefox/i.test(navigator.userAgent)) {
  const cache = createDefaultAuthorizationCache();
  // MWA signs using its authorized chain. Keep instances chain-bound and do
  // not restore a cached authorization belonging to the other network.
  for (const chain of ["solana:mainnet", "solana:devnet"]) {
    registerMwa({
      appIdentity: { name: "IQ Labs", uri: window.location.origin, icon: "/img/coinlogo.webp" },
      chains: [chain],
      authorizationCache: {
        ...cache,
        get: async () => {
          const authorization = await cache.get();
          return authorization?.chain === chain ? authorization : undefined;
        },
      },
    });
  }
}
const solflareAdapters = new Map();
const chainOf = (cluster) => {
  if (cluster === "devnet") return "solana:devnet";
  if (cluster === "mainnet") return "solana:mainnet";
  throw new Error("Unsupported Solana network: " + cluster);
};

// Wrap a Wallet Standard wallet as a legacy-shaped provider. One adapter per
// wallet and cluster, so the connected account survives repeated listing.
const adapters = new Map();
function adapt(wallet, cluster) {
  let byCluster = adapters.get(wallet);
  if (!byCluster) { byCluster = new Map(); adapters.set(wallet, byCluster); }
  if (byCluster.has(cluster)) return byCluster.get(cluster);
  const chain = chainOf(cluster);
  const feature = (name) => {
    const value = wallet.features[name];
    if (!value) throw new Error(wallet.name + " does not support " + name);
    return value;
  };

  let account = null;
  let connectGeneration = 0;
  let accountRevision = 0;
  const listeners = new Map();
  const emit = (ev, ...args) => { for (const f of listeners.get(ev) || []) { try { f(...args); } catch (e) {} } };
  const pick = (accounts) => (accounts || []).find((a) => a.chains?.includes(chain)) || null;
  const serialize = (tx) => (tx instanceof VersionedTransaction ? tx.serialize() : tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
  const input = (tx) => {
    if (!account || !account.chains.includes(chain)) throw new Error("Reconnect your wallet on " + chain);
    return { account, transaction: serialize(tx), chain };
  };
  const provider = {
    name: wallet.name,
    icon: wallet.icon || null,
    get publicKey() { return account ? new PublicKey(account.publicKey) : null; },
    connect: async (opts) => {
      const generation = ++connectGeneration, revision = accountRevision, attempt = connectionAttempt;
      const out = await feature("standard:connect").connect(opts && opts.onlyIfTrusted ? { silent: true } : undefined);
      const next = pick(out && out.accounts) || pick(wallet.accounts);
      if (generation !== connectGeneration || attempt !== connectionAttempt) throw new Error("Wallet connection changed; try again");
      if (revision !== accountRevision && (!account || !next || next.address !== account.address)) throw new Error("Wallet account changed; try again");
      if (!next) throw new Error(wallet.name + " did not return an account for " + chain);
      if (revision === accountRevision) account = next;
      return { publicKey: provider.publicKey };
    },
    disconnect: async () => {
      connectGeneration++;
      accountRevision++;
      account = null;
      const d = wallet.features["standard:disconnect"];
      if (d) await d.disconnect();
    },
    signMessage: async (message) => {
      if (!account || !account.features.includes("solana:signMessage")) throw new Error("This wallet account cannot sign messages");
      const signingAccount = account;
      const [out] = await feature("solana:signMessage").signMessage({ account, message });
      if (account?.address !== signingAccount.address) throw new Error("Wallet account changed; try again");
      return { signature: out.signature, publicKey: provider.publicKey };
    },
    signTransaction: async (tx) => {
      const request = input(tx);
      if (!account.features.includes("solana:signTransaction")) throw new Error("This wallet account cannot sign transactions");
      const [out] = await feature("solana:signTransaction").signTransaction(request);
      if (account?.address !== request.account.address) throw new Error("Wallet account changed; try again");
      return tx instanceof VersionedTransaction ? VersionedTransaction.deserialize(out.signedTransaction) : Transaction.from(out.signedTransaction);
    },
    signAndSendTransaction: async (tx) => {
      const f = wallet.features["solana:signAndSendTransaction"];
      if (!f) throw new Error(wallet.name + " cannot send transactions from this page");
      const request = input(tx);
      if (!account.features.includes("solana:signAndSendTransaction")) throw new Error("This wallet account cannot send transactions");
      const [out] = await f.signAndSendTransaction(request);
      return { signature: bs58.encode(out.signature) };
    },
    on: (ev, f) => { if (!listeners.has(ev)) listeners.set(ev, new Set()); listeners.get(ev).add(f); },
    removeListener: (ev, f) => { const s = listeners.get(ev); if (s) s.delete(f); },
  };
  // The standard's single "change" event becomes the accountChanged /
  // disconnect pair the page already listens for on Phantom.
  try {
    const events = wallet.features["standard:events"];
    if (events) events.on("change", (props) => {
      if (!props || !("accounts" in props)) return;
      accountRevision++;
      const next = pick(props.accounts), before = account && account.address;
      if (!next) { if (before) { account = null; emit("disconnect"); } return; }
      account = next;
      if (next.address !== before) emit("accountChanged", provider.publicKey);
    });
  } catch (e) {}
  byCluster.set(cluster, provider);
  return provider;
}

// Injected (legacy) providers, each already in the provider shape. Phantom
// first (its window.solana shim also claims the generic slot; Brave never
// creates window.phantom, so window.phantom.solana is always the real one),
// then Backpack's own handle.
function injected(cluster, standard) {
  const out = [];
  const phantom = window.phantom && window.phantom.solana;
  if (phantom) out.push({ id: "Phantom", name: "Phantom", icon: null, provider: phantom });
  if (window.backpack) out.push({ id: "Backpack", name: "Backpack", icon: null, provider: window.backpack });
  // Solflare's documented injected provider can exist without window.solana.
  // Prefer its Wallet Standard registration when one is available.
  const solflare = window.solflare;
  if (!standard.some((w) => w.name === "Solflare") && solflare?.isSolflare &&
      typeof solflare.connect === "function" && typeof solflare.signTransaction === "function") {
    out.push({ id: "Solflare", name: "Solflare", icon: null, provider: solflare });
  }
  if (!standard.some((w) => w.name === "Solflare") && !out.some((w) => w.id === "Solflare") && window.SolflareApp) {
    // The mobile app bridge is not a legacy window.solana provider. Let its SDK handle it.
    if (!solflareAdapters.has(cluster)) solflareAdapters.set(cluster, new Solflare({ network: cluster === "devnet" ? "devnet" : "mainnet-beta" }));
    out.push({ id: "Solflare", name: "Solflare", icon: null, provider: solflareAdapters.get(cluster) });
  }
  return out;
}

// Every usable wallet right now: injected first, then standard-registered ones
// not already listed by name, then the bare window.solana as a last resort.
export function listWallets(cluster = "mainnet") {
  const chain = chainOf(cluster);
  const standard = registry.get().filter((w) => w.features["standard:connect"] && w.chains.includes(chain));
  const out = injected(cluster, standard);
  // Keep legacy signing providers, but reuse their registered display metadata.
  for (const entry of out) entry.icon = standard.find((wallet) => wallet.name === entry.name)?.icon || entry.icon;
  const seen = new Set(out.map((w) => w.name));
  for (const w of standard) {
    if (seen.has(w.name)) continue;
    seen.add(w.name);
    out.push({ id: w.name, name: w.name === "Mobile Wallet Adapter" ? "Use installed wallet" : w.name, icon: w.icon || null, provider: adapt(w, cluster) });
  }
  const bare = window.solana;
  if (!out.length && bare) out.push({ id: "window.solana", name: "Solana wallet", icon: null, provider: bare });
  return out;
}

// Extensions can inject late (Brave delays it; standard wallets register
// asynchronously), so a connect waits briefly for a first entry.
async function waitForWallets(cluster, ms) {
  let list = listWallets(cluster);
  for (let waited = 0; !list.length && waited < ms; waited += 100) {
    await new Promise((r) => setTimeout(r, 100));
    list = listWallets(cluster);
  }
  return list;
}

let active = null; // the provider the page is connected through
let connectionAttempt = 0;
let disconnected = false;
export function getWalletProvider() { return active; }
export function disconnectWallet() {
  connectionAttempt++;
  const p = active;
  active = null;
  disconnected = true;
  try { localStorage.setItem(LAST_KEY, "disconnected"); } catch (e) {}
  if (p && p.disconnect) Promise.resolve(p.disconnect()).catch(() => {});
}

export const NO_WALLET = "No Solana wallet found. On mobile, open this page in your wallet app's browser, then tap Connect. On desktop, unlock your wallet extension and try again.\n\nBrave users: open brave://settings/wallet and set Default cryptocurrency wallet to \"Extensions (no fallback)\" so your extension wallet is detected.";
export const CHOOSE_WALLET = "Choose a Solana wallet first.";

// Same contract as evm.js connectWallet: the saved or only wallet connects by
// itself; an ambiguous choice (2+ wallets, none saved) throws CHOOSE_WALLET so
// the page opens its picker; onlyIfTrusted never prompts and returns null when
// nothing can be restored silently. onProvider(p) fires with the chosen
// provider before its connect is awaited, so the page can bind account-change
// listeners that outrank a late silent reconnect.
export async function connectWallet({ onlyIfTrusted = false, walletId, cluster = "mainnet", onProvider } = {}) {
  const attempt = onlyIfTrusted ? connectionAttempt : ++connectionAttempt;
  const options = await waitForWallets(cluster, onlyIfTrusted ? 300 : 2000);
  let saved;
  try { saved = localStorage.getItem(LAST_KEY); } catch (e) {}
  if (onlyIfTrusted && (disconnected || saved === "disconnected")) return null;
  const wanted = walletId || (saved !== "disconnected" ? saved : null);
  const choice = options.find((w) => w.id === wanted) || (!walletId && options.length === 1 ? options[0] : null);
  if (!choice) {
    if (onlyIfTrusted) return null;
    throw new Error(options.length ? CHOOSE_WALLET : NO_WALLET);
  }
  const p = choice.provider;
  if (attempt !== connectionAttempt) {
    if (onlyIfTrusted) return null;
    throw new Error("Wallet connection changed; try again");
  }
  if (onProvider) onProvider(p);
  if (onlyIfTrusted) {
    // Do not assume every legacy provider supports Phantom's silent-connect
    // option. A disconnected Solflare must be connected by an explicit click.
    if ((p === window.solflare || p instanceof Solflare) && !p.publicKey) return null;
    if (!p.publicKey) {
      try { await p.connect({ onlyIfTrusted: true }); } catch (e) { return null; }
    }
    if (!p.publicKey) return null;
  } else {
    await p.connect();
    if (!p.publicKey) throw new Error(choice.name + " did not connect");
  }
  if (attempt !== connectionAttempt) {
    if (onlyIfTrusted) return null;
    throw new Error("Wallet connection changed; try again");
  }
  active = p;
  disconnected = false;
  try { localStorage.setItem(LAST_KEY, choice.id); } catch (e) {}
  return p.publicKey.toBase58();
}

// Solflare's documented user-clicked browse link handles iOS, where MWA is unavailable.
export function solflareBrowseUrl() {
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const page = new URL(window.location.href);
  if (!mobile || page.protocol !== "https:" || page.username || page.password ||
      ["localhost", "127.0.0.1", "[::1]"].includes(page.hostname)) return null;
  return "https://solflare.com/ul/v1/browse/" + encodeURIComponent(page.href) + "?ref=" + encodeURIComponent(page.origin);
}
