// nft_bridge.js - the classic<->ESM bridge for the inscription NFT launchpad.
// Exposes window.iqNft and fires "iqnft:ready". The page module nft_launch.js
// (?menu=nft) is classic jQuery and drives everything through this surface.
// Wallet + burner material stays in this module; the page only sees pubkeys.
// SDK + web3 resolve through index.html's importmap, same as browser.js.
import {solanaMarketUrl} from "../../nft-market-links.mjs";
import { Connection, PublicKey } from "@solana/web3.js";
import { setRpcUrl } from "@iqlabs-official/solana-sdk";
import {createPackBootstrap,createPackPendingStorage,assertPackRuntime} from "./pack_bootstrap.mjs";
import {guardPackCreator} from "./pack_wallet.mjs";
import { deriveBurner } from "./burner.js";
import {topUp,sweep} from './inscribe.js?v=9';
import {estimateCost,getAccountRent} from './cost.js?v=6';
import { listWallets, connectWallet, getWalletProvider, disconnectWallet } from "./wallets.js?v=1";
import * as nft from "./nft.js?v=packs-refresh-20261101";
import { deploy, pendingDeploy } from "./nft_create.js?v=packs-refresh-20261101";
import { compressImage } from "./image_compress.js?v=1";
import { readAsset, readInscription, viewAssetViaGateway, gatewayMetadata } from "./nft_asset.js?v=4";
import { preset, net, setNet } from "./nft_net.js?v=packs-refresh-20261101";

// The NFT program + backend run on their own network (see nft_net.js), which may
// differ from the rest of the site, so the NFT page keeps its own RPC under its
// own localStorage key. To switch networks, flip NET_DEFAULT in nft_net.js; the
// RPC, backend, gateway and explorer all move together.
const RPC_KEY = "iq6900_nft_rpc";
function rpc() { try { return localStorage.getItem(RPC_KEY) || preset().rpc; } catch (e) { return preset().rpc; } }
function connection() { return new Connection(rpc(), "confirmed"); }
// The gateway that serves /img and /token-meta for this cluster (matches the
// backend's config.gatewayBase). From the preset, so it can never desync from
// the cluster even if a same-network custom RPC is set.
function gatewayBase() { return preset().gateway; }

// Wallet: any Solana wallet the site discovers (wallets.js: Wallet Standard
// wallets such as Jupiter or MetaMask, plus Phantom/Backpack), connected on
// the NFT cluster. Nothing prompts on entry: restore() only reconnects a
// wallet that approved this site before, connect() runs from the button.
function active() { return getWalletProvider(); }
async function ensureConnected(walletId) {
  const p = active();
  if (p && p.publicKey) return p;
  await connectWallet({ walletId, cluster: net() });
  return getWalletProvider();
}
// The burner is derived from one wallet signature, so deriving it is a wallet
// popup. It happens only when the user acts (mint, deploy); never on page entry.
// Its public key is remembered per wallet (public data), so a returning user's
// cost estimate can read the burner's account rent without any popup.
const BURNER_KEY = (wallet) => "iq6900_nft_burner_" + wallet;
async function burnerFor(provider) {
  // Same derivation as the code-in page: one signMessage, raw signature bytes out.
  const signMessage = async (msg) => {
    const out = await provider.signMessage(msg instanceof Uint8Array ? msg : new TextEncoder().encode(msg), "utf8");
    return out.signature || out;
  };
  const burner = await deriveBurner(signMessage);
  try { localStorage.setItem(BURNER_KEY(provider.publicKey.toBase58()), burner.publicKey.toBase58()); } catch (e) {}
  return burner;
}
function knownBurner(provider) {
  try { const b = localStorage.getItem(BURNER_KEY(provider.publicKey.toBase58())); return b ? { publicKey: new PublicKey(b) } : null; } catch (e) { return null; }
}

// The page calls nft.js's reads/helpers under their real names across the
// ESM->window boundary (it is a classic script and cannot import), so the whole
// module is re-exposed by spread. Only the entries that need a wallet, an RPC,
// or the backend host are defined here; `mint` and `estimateMintCost` override
// the engine's pure versions by supplying the browser's connection/wallet/burner.
let creatorAccess=null;
function packConfig() {
  return assertPackRuntime(window.iqPackCreatorConfig??window.iqPackConfig,{hostname:location.hostname,network:net(),rpc:rpc(),api:nft.nftApi(),gateway:gatewayBase()});
}
function packSession() {
  const config=packConfig();
  return {config,connection:new Connection(config.rpc,'confirmed'),check(){if(packConfig()!==config)throw Error('Pack configuration changed; review it again before signing');}};
}
// These actions share a burner per creator on each chain. Hold the lock
// through funding and checkpoint writes so another tab cannot act on stale state.
async function withPackMediaLock(chain, owner, action) {
  if (!navigator.locks) throw Error('Pack publication requires a browser with cross-tab locking');
  return navigator.locks.request(
    ['iq-pack-media', chain, owner].join(':'),
    { ifAvailable: true },
    lock => {
      if (!lock) throw Error('Pack media is busy in another tab. Finish that action, then try again.');
      return action();
    },
  );
}
async function packMediaBudget(kit,signer,session) {
  const {mediaFundingBudget}=await import('/pack-client.js');
  const rent=await getAccountRent(session.connection,signer.publicKey);session.check();
  return mediaFundingBudget(kit,rent,estimateCost);
}

window.iqNft = Object.assign({}, nft, {
  getRpc: rpc,
  setRpc: (u) => { try { u ? localStorage.setItem(RPC_KEY, u) : localStorage.removeItem(RPC_KEY); } catch (e) {} },
  health: async () => { try { return await (await fetch(window.iqNft.nftApi() + "/health",{signal:AbortSignal.timeout(10000)})).json(); } catch (e) { return { ok: false, error: String(e) }; } },
  solscanTx: (sig) => `https://solscan.io/tx/${sig}${preset().explorerCluster}`,
  // cluster suffix + gateway host, so the page (nft_launch.js) builds explorer
  // links and host labels from the same single source instead of re-sniffing.
  explorerCluster: () => preset().explorerCluster,
  gatewayHost: () => preset().gateway.replace(/^https?:\/\//, ""),
  net,
  marketUrl: asset => solanaMarketUrl(asset, "solana:" + net()),
  setNet,
  // the gateway's own hosted viewer page for an inscription (renders the content
  // from chain); cluster-matched so devnet sigs resolve on the devnet gateway
  viewUrl: (sig) => gatewayBase() + "/view/" + sig,
  imgUrl: (sig) => gatewayBase() + "/img/" + sig + ".png", // the gateway render of an image inscription
  metaUrl: (M) => gatewayBase() + "/token-meta/" + M, // the asset uri we register
  gatewayMeta: (M) => gatewayMetadata(gatewayBase(), M),
  // {id, name, icon, selected} per discovered wallet; connect(id) picks one,
  // connect() takes the saved or only wallet and throws "Choose a Solana wallet
  // first." when it is ambiguous (the page then shows its picker).
  wallets: () => listWallets(net()).map(({ id, name, icon, provider }) => ({ id, name, icon, selected: provider === getWalletProvider() })),
  connect: async (walletId) => (await ensureConnected(walletId)).publicKey.toBase58(),
  restore: () => connectWallet({ onlyIfTrusted: true, cluster: net() }),
  disconnect: disconnectWallet,
  connected: () => { const p = active(); return p && p.publicKey ? p.publicKey.toBase58() : null; },
  // Silent: uses the remembered burner key when there is one, never signs.
  estimateMintCost: async (col) => {
    try { const p = active(), b = p && p.publicKey && knownBurner(p); return b ? nft.estimateMintCost(col, connection(), b) : nft.estimateMintCost(col); }
    catch (e) { return nft.estimateMintCost(col); }
  },
  mint: async ({ slug, collection, onStage, onProgress }) => {
    const provider = await ensureConnected();
    setRpcUrl(rpc()); // SDK global RPC; point it at the NFT cluster for this write
    return nft.mint({ connection: connection(), wallet: provider, burner: await burnerFor(provider), slug, collection, onStage, onProgress });
  },
  async enablePackOutfits({wallet,account,asset,collection,registry}) {
    const session=packSession(),config=session.config;
    const url=new URL('/creator/packs/outfit-context',config.apiBase);url.searchParams.set('asset',asset);url.searchParams.set('collection',collection);url.searchParams.set('owner',account.address);
    const response=await fetch(url,{credentials:'omit',signal:AbortSignal.timeout(20000)}),context=await response.json();if(!response.ok)throw Error(context.error||'Outfit consent is unavailable');session.check();
    const creatorWallet=registry.get().find(value=>value.accounts.some(account=>account.address===context.admin));
    const creatorAccount=creatorWallet?.accounts.find(account=>account.address===context.admin);
    const {enableOutfits}=await import('/pack-client.js');session.check();
    return enableOutfits({connection:session.connection,wallet,account,creatorWallet,creatorAccount,chain:config.chain,localGenesis:config.localGenesis,context,collection,expectedAsset:asset,deployment:config.deployment});
  },
  async restorePackMetadata({wallet,account,asset,collection,nftProgram}) {
    const session=packSession(),config=session.config;if(config.deployment.nftProgram!==nftProgram)throw Error('The NFT recovery program changed');
    const {Transaction,sendWalletTransaction,restoreOutfitInstruction}=await import('/pack-client.js');session.check();
    return sendWalletTransaction({connection:session.connection,wallet,account,chain:config.chain,localGenesis:config.localGenesis,transaction:new Transaction().add(restoreOutfitInstruction({nftProgram,collection,owner:account.address,asset}))});
  },
  async authorizePackCreator() {
    const session=packSession(),config=session.config,provider=guardPackCreator(await ensureConnected()),owner=provider.publicKey.toBase58();session.check();
    const wallet=config.registry.get().find(value=>value.accounts.some(account=>account.address===owner)),account=wallet?.accounts.find(account=>account.address===owner);
    if(!account)throw Error('Connect the creator through the configured Wallet Standard registry');
    if(!creatorAccess||creatorAccess.config!==config||creatorAccess.wallet!==wallet||creatorAccess.account!==account) {
      const {createPackCreatorAuth,assertConnectionChain}=await import('/pack-client.js');session.check();
      creatorAccess={config,wallet,account,auth:createPackCreatorAuth({wallet,account,chain:config.chain,program:config.deployment.program,genesis:await assertConnectionChain(session.connection,config.chain,config.localGenesis),site:location.origin,endpoint:new URL('/creator/packs/auth',config.apiBase).href})};session.check();
    }
    const headers=await creatorAccess.auth.headers();session.check();if(provider.publicKey.toBase58()!==owner)throw Error('Creator wallet changed; reconnect');
    return headers;
  },
  async publishPackSetup({setup,collection,operationsReserveLamports,sealedRelease}) {
    const session=packSession(),config=session.config,provider=guardPackCreator(await ensureConnected()),owner=provider.publicKey.toBase58();session.check();
    const wallet=config.registry.get().find(value=>value.accounts.some(account=>account.address===owner));
    const selected=wallet?.accounts.find(account=>account.address===owner);
    if(!selected)throw Error('Connect the creator through the configured Wallet Standard registry');
    const {publishPackSetup}=await import('/pack-client.js');session.check();if(provider.publicKey.toBase58()!==owner)throw Error('Creator wallet changed; reconnect before continuing');
    return publishPackSetup({connection:session.connection,wallet,account:selected,chain:config.chain,localGenesis:config.localGenesis,setup,expectedCollection:collection,deployment:config.deployment,sealedRelease:config.sealedPacks?sealedRelease:undefined,operationsReserveLamports,pendingTransactions:createPackPendingStorage(()=>localStorage)});
  },
  async quotePackMedia({kit}) {
    const session=packSession(),provider=guardPackCreator(await ensureConnected()),burner=await burnerFor(provider);session.check();
    return {mediaFundingLamports:await packMediaBudget(kit,burner,session)};
  },
  async sweepPackFunding() {
    const session = packSession();
    const provider = guardPackCreator(await ensureConnected());
    const owner = provider.publicKey;
    const address = owner.toBase58();
    return withPackMediaLock(session.config.chain, address, async () => {
      const burner = await burnerFor(provider);
      session.check();
      if (provider.publicKey?.toBase58() !== address || provider.isConnected === false)
        throw Error('Creator wallet changed; reconnect before continuing');
      await sweep(session.connection, burner, owner);
      session.check();
    });
  },
  async publishPackMedia({kit,draftId,collection,readSource,maxFundingLamports,onProgress,recoveredSignature}) {
    const session = packSession();
    const { config } = session;
    const provider = guardPackCreator(await ensureConnected());
    const original = provider.publicKey.toBase58();
    const check = () => {
      session.check();
      if (provider.publicKey?.toBase58() !== original || provider.isConnected === false)
        throw Error('Creator wallet changed; reconnect before continuing');
    };
    return withPackMediaLock(config.chain, original, async () => {
      check();
      const burner = await burnerFor(provider);
      const budget = await packMediaBudget(kit, burner, session);
      if (!Number.isSafeInteger(maxFundingLamports) || budget > maxFundingLamports)
        throw Error('Check and review the pack media funding estimate again');
      const { createIqMediaContext, publishKitArtifacts } = await import('/pack-client.js');
      const sdk = await import('@iqlabs-official/solana-sdk');
      check();

      const key = ['iq-pack-publication', config.chain, original, collection, draftId].join(':');
      const checkpoint = JSON.parse(localStorage.getItem(key) || '{}');
      const signer = {
        publicKey: burner.publicKey,
        async signTransaction(tx) {
          check();
          tx.partialSign(burner);
          return tx;
        },
      };
      const context = await createIqMediaContext({
        sdk: sdk.default ?? sdk,
        connection: session.connection,
        signer,
        owner: original,
        chain: config.chain,
        localGenesis: config.localGenesis,
        gateway: config.gateway,
        saveCheckpoint: async value => localStorage.setItem(key, JSON.stringify(value)),
        onProgress: typeof onProgress === 'function' ? progress => {
          const pendingKey = checkpoint.pending?.key;
          const file = pendingKey?.startsWith('image:') ? pendingKey.slice(6) : progress.name;
          onProgress({ ...progress, file });
        } : undefined,
      });
      context.recoveredSignature = recoveredSignature;
      let funded = false;
      context.beforeWrite = async () => {
        check();
        if (!funded) {
          await topUp(session.connection, provider, burner.publicKey, budget);
          check();
          funded = true;
        }
        setRpcUrl(session.connection.rpcEndpoint);
      };
      check();
      setRpcUrl(session.connection.rpcEndpoint);
      await publishKitArtifacts(kit, readSource, context, checkpoint);
      check();
      return checkpoint;
    });
  },
  // Creator deploy: same wallet/burner wiring as mint. compressImage is exposed
  // so the creator page can preview a compressed size before deploying.
  deploy: async ({ spec, items, onStage }) => {
    const provider = await ensureConnected();
    setRpcUrl(rpc());
    return deploy({ connection: connection(), wallet: provider, burner: await burnerFor(provider), spec, items, onStage });
  },
  pendingDeploy,
  compressImage,
  // On-chain NFT viewer: reads an asset entirely from the chain (no backend).
  // setRpcUrl points the SDK reader's linked-list/session walk at this cluster.
  // Default viewer path: account from chain + metadata/image from the gateway cache.
  viewAsset: async (asset) => viewAssetViaGateway(connection(), gatewayBase(), asset),
  // The proof path: everything decoded from chain by the browser, no gateway.
  recoverAsset: async (asset, onStep) => { setRpcUrl(rpc()); return readAsset(connection(), asset, onStep); },
  // Read one inscription feed row {kind, body, who} from chain (single-NFT view
  // uses it to show the content and confirm the connected wallet owns it).
  readRow: async (sig) => { setRpcUrl(rpc()); return JSON.parse(await readInscription(connection(), sig)); },
  // Single NFT: turn the user's existing inscription C into a 1/1.
  mintSingle: async ({ C, name, kind, onStage }) => {
    const provider = await ensureConnected();
    setRpcUrl(rpc());
    return nft.mintSingle({ connection: connection(), wallet: provider, burner: await burnerFor(provider), gatewayBase: gatewayBase(), C, name, kind, onStage });
  },
});
const bootstrapPacks=createPackBootstrap({
  target:window,getPreset:preset,getNetwork:net,getRpc:rpc,getApi:nft.nftApi,getHealth:()=>window.iqNft.health(),
  loadClient:()=>import('/pack-client.js'),getStorage:()=>localStorage,
  enableOutfits:args=>window.iqNft.enablePackOutfits(args),
});
// A local acceptance host may supply its own explicit pinned bootstrap. The
// native static-site path otherwise initializes from the selected preset.
if(!window.iqPackBootstrap)window.iqPackBootstrap=window.iqPackCreatorConfig
  ?Promise.resolve({enabled:true}):bootstrapPacks();
// Pages await and display configuration errors; avoid an unhandled rejection
// on unrelated ordinary NFT routes when an operator's pins are invalid.
window.iqPackBootstrap.catch(()=>{});
window.iqNftReady = true;
window.dispatchEvent(new Event("iqnft:ready"));
