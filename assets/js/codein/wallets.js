// wallets.js - Solana wallet discovery for the site, in one place.
//
// Every wallet that registers through the Wallet Standard (Jupiter, MetaMask,
// Backpack, Solflare, Phantom, OKX, ...) plus the legacy window.phantom.solana
// and window.solana handles, as one list. A Wallet Standard wallet is wrapped
// into the small provider shape the engines already use (publicKey, connect,
// signMessage, signTransaction, signAndSendTransaction, on/removeListener), so
// inscribe.js does not know which kind it holds.
// Phantom and Backpack keep their own injected providers (the path every
// existing user's burner was derived through); a wallet that is both injected
// and registered is listed once.
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

const LAST_KEY = "iq6900_solana_wallet"; // the wallet id the user connected last, or "disconnected"
const standard = new Map(); // name -> Wallet Standard wallet object

// Discovery handshake: a wallet that loaded before us answers our app-ready
// event; one that loads later dispatches register-wallet with a callback that
// takes our api. Both end in api.register(wallet).
const api = Object.freeze({
  register: (...wallets) => {
    for (const w of wallets) if (w && w.name && w.features && w.features["standard:connect"]) standard.set(w.name, w);
  },
});
try { window.addEventListener("wallet-standard:register-wallet", (ev) => { try { ev.detail(api); } catch (e) {} }); } catch (e) {}
try { window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: api })); } catch (e) {}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(bytes) {
  const digits = [0];
  for (const b of bytes) {
    let carry = b;
    for (let i = 0; i < digits.length; i++) { carry += digits[i] << 8; digits[i] = carry % 58; carry = (carry / 58) | 0; }
    while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let out = "";
  for (const b of bytes) { if (b) break; out += "1"; }
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]];
  return out;
}

const chainOf = (cluster) => (cluster === "devnet" ? "solana:devnet" : "solana:mainnet");

// Wrap a Wallet Standard wallet as a legacy-shaped provider. One adapter per
// wallet and cluster, so the connected account survives repeated listing.
const adapters = new Map();
function adapt(wallet, cluster) {
  const key = wallet.name + "|" + cluster;
  if (adapters.has(key)) return adapters.get(key);
  const chain = chainOf(cluster);
  const feature = (name) => wallet.features[name];
  const onChain = (wallet.chains || []).includes(chain);
  let account = null;
  const listeners = new Map();
  const emit = (ev, ...args) => { for (const f of listeners.get(ev) || []) { try { f(...args); } catch (e) {} } };
  const pick = (accounts) => (accounts || []).find((a) => !a.chains || a.chains.includes(chain)) || (accounts || [])[0] || null;
  const serialize = (tx) => (tx instanceof VersionedTransaction ? tx.serialize() : tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
  const input = (tx) => Object.assign({ account, transaction: serialize(tx) }, onChain ? { chain } : {});
  const provider = {
    name: wallet.name,
    icon: wallet.icon || null,
    get publicKey() { return account ? new PublicKey(account.publicKey) : null; },
    connect: async (opts) => {
      const out = await feature("standard:connect").connect(opts && opts.onlyIfTrusted ? { silent: true } : undefined);
      account = pick(out && out.accounts) || pick(wallet.accounts);
      if (!account) throw new Error(wallet.name + " did not return an account");
      return { publicKey: provider.publicKey };
    },
    disconnect: async () => {
      account = null;
      const d = feature("standard:disconnect");
      if (d) await d.disconnect();
    },
    signMessage: async (message) => {
      const [out] = await feature("solana:signMessage").signMessage({ account, message });
      return { signature: out.signature, publicKey: provider.publicKey };
    },
    signTransaction: async (tx) => {
      const [out] = await feature("solana:signTransaction").signTransaction(input(tx));
      return tx instanceof VersionedTransaction ? VersionedTransaction.deserialize(out.signedTransaction) : Transaction.from(out.signedTransaction);
    },
    signAndSendTransaction: async (tx) => {
      const f = feature("solana:signAndSendTransaction");
      if (!f) throw new Error(wallet.name + " cannot send transactions from this page");
      const [out] = await f.signAndSendTransaction(input(tx));
      return { signature: base58(out.signature) };
    },
    on: (ev, f) => { if (!listeners.has(ev)) listeners.set(ev, new Set()); listeners.get(ev).add(f); },
    removeListener: (ev, f) => { const s = listeners.get(ev); if (s) s.delete(f); },
  };
  // The standard's single "change" event becomes the accountChanged /
  // disconnect pair the page already listens for on Phantom.
  try {
    const events = feature("standard:events");
    if (events) events.on("change", (props) => {
      if (!props || !("accounts" in props)) return;
      const next = pick(props.accounts), before = account && account.address;
      if (!next) { if (before) { account = null; emit("disconnect"); } return; }
      if (next.address !== before) { account = next; emit("accountChanged", provider.publicKey); }
    });
  } catch (e) {}
  adapters.set(key, provider);
  return provider;
}

// Injected (legacy) providers, each already in the provider shape. Phantom
// first (its window.solana shim also claims the generic slot; Brave never
// creates window.phantom, so window.phantom.solana is always the real one),
// then Backpack's own handle.
function injected() {
  const out = [];
  const phantom = window.phantom && window.phantom.solana;
  if (phantom) out.push({ id: "Phantom", name: "Phantom", icon: null, provider: phantom });
  if (window.backpack) out.push({ id: "Backpack", name: "Backpack", icon: null, provider: window.backpack });
  return out;
}

// Every usable wallet right now: injected first, then standard-registered ones
// not already listed by name, then the bare window.solana as a last resort.
export function listWallets(cluster = "mainnet") {
  const out = injected();
  const seen = new Set(out.map((w) => w.name));
  for (const w of standard.values()) {
    if (seen.has(w.name)) continue;
    seen.add(w.name);
    out.push({ id: w.name, name: w.name, icon: w.icon || null, provider: adapt(w, cluster) });
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
let disconnected = false;
export function getWalletProvider() { return active; }
export function disconnectWallet() {
  const p = active;
  active = null;
  disconnected = true;
  try { localStorage.setItem(LAST_KEY, "disconnected"); } catch (e) {}
  if (p && p.disconnect) Promise.resolve(p.disconnect()).catch(() => {});
}

export const NO_WALLET = "No Solana wallet found. Install Phantom, Jupiter, Backpack or Solflare.\n\nBrave users: open brave://settings/wallet and set Default cryptocurrency wallet to \"Extensions (no fallback)\" so your extension wallet is detected.";
export const CHOOSE_WALLET = "Choose a Solana wallet first.";

// Same contract as evm.js connectWallet: the saved or only wallet connects by
// itself; an ambiguous choice (2+ wallets, none saved) throws CHOOSE_WALLET so
// the page opens its picker; onlyIfTrusted never prompts and returns null when
// nothing can be restored silently. onProvider(p) fires with the chosen
// provider before its connect is awaited, so the page can bind account-change
// listeners that outrank a late silent reconnect.
export async function connectWallet({ onlyIfTrusted = false, walletId, cluster = "mainnet", onProvider } = {}) {
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
  if (onProvider) onProvider(p);
  if (onlyIfTrusted) {
    if (!p.publicKey) {
      try { await p.connect({ onlyIfTrusted: true }); } catch (e) { return null; }
    }
    if (!p.publicKey) return null;
  } else {
    await p.connect();
    if (!p.publicKey) throw new Error(choice.name + " did not connect");
  }
  active = p;
  disconnected = false;
  try { localStorage.setItem(LAST_KEY, choice.id); } catch (e) {}
  return p.publicKey.toBase58();
}
