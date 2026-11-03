import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const web3=require('@solana/web3.js');
const nacl=require('tweetnacl');
const b58=require('bs58');
const bs58=b58.default||b58;
const {JSDOM}=require('jsdom');
const signer=web3.Keypair.fromSeed(new Uint8Array(32).fill(47));
const account=(chain='solana:devnet',features=['solana:signMessage','solana:signTransaction','solana:signAndSendTransaction'])=>({address:signer.publicKey.toBase58(),publicKey:signer.publicKey.toBytes(),chains:[chain],features});
function wallet(name='Jupiter',accounts=[account()]){
 let change,requests=[];
 const w={name,version:'1.0.0',icon:'data:image/png;base64,',chains:['solana:mainnet','solana:devnet'],accounts:[],features:{
  'standard:connect':{version:'1.0.0',connect:async options=>{requests.push(['connect',options]);return{accounts};}},
  'standard:events':{version:'1.0.0',on:(event,f)=>{change=f;return()=>{};}},
  'solana:signMessage':{version:'1.0.0',signMessage:async request=>{requests.push(['message',request]);return[{signature:nacl.sign.detached(request.message,signer.secretKey),signedMessage:request.message}];}},
  'solana:signTransaction':{version:'1.0.0',signTransaction:async request=>{requests.push(['transaction',request]);const tx=web3.Transaction.from(request.transaction);tx.partialSign(signer);return[{signedTransaction:tx.serialize()}];}},
  'solana:signAndSendTransaction':{version:'1.0.0',signAndSendTransaction:async request=>{requests.push(['send',request]);return[{signature:new Uint8Array(64)}];}}
 }};
 return {w,requests,emit:(accounts)=>{w.accounts=accounts;change?.({accounts});}};
}
async function load({wallets=[],ua='desktop',secure=true,legacy,bridge=false,built=false,url='http://127.0.0.1:4612'}={}){
 const dom=new JSDOM('',{url}),window=dom.window;
 Object.defineProperty(window.navigator,'userAgent',{value:ua});Object.defineProperty(window,'isSecureContext',{value:secure});
 if(legacy)window.solflare=legacy;if(bridge)window.SolflareApp={};
 const mwaConfigs=[],sdkInstances=[];let cachedAuthorization;const createDefaultAuthorizationCache=()=>({get:async()=>cachedAuthorization,set:async value=>{cachedAuthorization=value;},clear:async()=>{cachedAuthorization=undefined;}});
 class Solflare {constructor(config){this.config=config;this.publicKey=null;sdkInstances.push(this);}async connect(){this.publicKey=signer.publicKey;}async disconnect(){this.publicKey=null;}async signMessage(message){return nacl.sign.detached(message,signer.secretKey);}}
 const context=vm.createContext({window,document:window.document,navigator:window.navigator,localStorage:window.localStorage,CustomEvent:window.CustomEvent,Event:window.Event,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,crypto:globalThis.crypto,console,setTimeout,clearTimeout,setInterval,clearInterval});
 const mod=new vm.SourceTextModule(await readFile(new URL(built?'../.test-build/wallets.js':'../../../assets/js/codein/wallets.js',import.meta.url),'utf8'),{context});
 const deps={
  './wallet-transports.js?v=1':{getWallets:()=>({get:()=>wallets}),registerMwa:config=>{mwaConfigs.push(config);},createDefaultAuthorizationCache,Solflare,bs58},
  '@solana/web3.js':web3,
 };
 await mod.link(spec=>new vm.SyntheticModule(Object.keys(deps[spec]),function(){for(const[k,v]of Object.entries(deps[spec]))this.setExport(k,v);},{context}));await mod.evaluate();
 return{api:mod.namespace,window,wallets,sdkInstances,mwaConfigs,cacheAuthorization:value=>{cachedAuthorization=value;},close:()=>window.close()};
}
const android='Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36';
test('MWA instances are browser/platform gated, chain-bound and reject other-network cache',async()=>{
 const f=await load({ua:android});assert.equal(f.mwaConfigs.length,2);
 assert.deepEqual(Array.from(f.mwaConfigs,c=>Array.from(c.chains)),[['solana:mainnet'],['solana:devnet']]);
 const auth={chain:'solana:mainnet',accounts:[]};f.cacheAuthorization(auth);
 assert.equal(await f.mwaConfigs[0].authorizationCache.get(),auth);
 assert.equal(await f.mwaConfigs[1].authorizationCache.get(),undefined);
 assert.equal(f.mwaConfigs[0].remoteHostAuthority,undefined);f.close();
 for(const options of[{ua:'iPhone Mobile Safari'},{ua:android,secure:false},{ua:android+' EdgA/140.0'}]){const x=await load(options);assert.equal(x.mwaConfigs.length,0);x.close();}
});
test('Jupiter Standard wallet registers late, is reused, and connects on the selected chain',async()=>{const f=await load(),j=wallet();assert.equal(f.api.listWallets('devnet').length,0);f.wallets.push(j.w);const p=f.api.listWallets('devnet')[0].provider;assert.equal(f.api.listWallets('devnet')[0].provider,p);assert.equal(await f.api.connectWallet({walletId:'Jupiter',cluster:'devnet'}),signer.publicKey.toBase58());assert.equal(f.api.getWalletProvider(),p);assert.equal(j.requests[0][1],undefined);f.close();});
test('wrong-chain account fails closed instead of falling back to its first account',async()=>{const j=wallet('Jupiter',[account('solana:mainnet')]),f=await load({wallets:[j.w]});await assert.rejects(f.api.connectWallet({walletId:'Jupiter',cluster:'devnet'}),/did not return an account/);assert.equal(f.api.getWalletProvider(),null);f.close();});
test('wallet without devnet support is omitted; arbitrary cluster is rejected',async()=>{const j=wallet();j.w.chains=['solana:mainnet'];const f=await load({wallets:[j.w]});assert.equal(f.api.listWallets('devnet').length,0);assert.throws(()=>f.api.listWallets('testnet'),/Unsupported/);f.close();});
test('Standard message signing preserves exact bytes and signature used for burner derivation',async()=>{const j=wallet(),f=await load({wallets:[j.w]});await f.api.connectWallet({cluster:'devnet'});const message=new TextEncoder().encode('fixed deterministic test message');const out=await f.api.getWalletProvider().signMessage(message);assert.equal(j.requests[1][1].message,message);assert.deepEqual(out.signature,nacl.sign.detached(message,signer.secretKey));assert.ok(nacl.sign.detached.verify(message,out.signature,signer.publicKey.toBytes()));f.close();});
test('Standard transaction signing preserves message and supplies explicit chain',async()=>{const j=wallet(),f=await load({wallets:[j.w]});await f.api.connectWallet({cluster:'devnet'});const tx=new web3.Transaction({feePayer:signer.publicKey,recentBlockhash:web3.Keypair.fromSeed(new Uint8Array(32).fill(48)).publicKey.toBase58()}).add(web3.SystemProgram.transfer({fromPubkey:signer.publicKey,toPubkey:signer.publicKey,lamports:0}));const signed=await f.api.getWalletProvider().signTransaction(tx);assert.deepEqual(signed.serializeMessage(),tx.serializeMessage());assert.ok(signed.verifySignatures());assert.equal(j.requests[1][1].chain,'solana:devnet');f.close();});
test('send signature encoding does not append an extra leading zero byte',async()=>{const j=wallet(),f=await load({wallets:[j.w]});await f.api.connectWallet({cluster:'devnet'});const tx=new web3.Transaction({feePayer:signer.publicKey,recentBlockhash:signer.publicKey.toBase58()}).add(web3.SystemProgram.transfer({fromPubkey:signer.publicKey,toPubkey:signer.publicKey,lamports:0}));assert.equal((await f.api.getWalletProvider().signAndSendTransaction(tx)).signature,'1'.repeat(64));f.close();});
test('trade-only account connects without message signing; mint action gives a useful capability error',async()=>{const j=wallet('Trade wallet',[account('solana:devnet',['solana:signTransaction'])]),f=await load({wallets:[j.w]});await f.api.connectWallet({cluster:'devnet'});await assert.rejects(f.api.getWalletProvider().signMessage(new Uint8Array(1)),/cannot sign messages/);f.close();});
test('account switch during signing invalidates the result',async()=>{const j=wallet(),f=await load({wallets:[j.w]});await f.api.connectWallet({cluster:'devnet'});j.w.features['solana:signMessage'].signMessage=async()=>{const changed=account();changed.address='11111111111111111111111111111111';changed.publicKey=new Uint8Array(32);j.emit([changed]);return[{signature:new Uint8Array(64)}];};await assert.rejects(f.api.getWalletProvider().signMessage(new Uint8Array(1)),/account changed/);f.close();});
test('disconnect event clears account and prevents transaction signing',async()=>{const j=wallet(),f=await load({wallets:[j.w]});await f.api.connectWallet({cluster:'devnet'});const p=f.api.getWalletProvider();let disconnected=0;p.on('disconnect',()=>disconnected++);j.emit([]);assert.equal(p.publicKey,null);assert.equal(disconnected,1);await assert.rejects(p.signTransaction({}),/Reconnect/);f.close();});
test('late restore cannot overwrite explicit new wallet selection',async()=>{const a=wallet('A'),b=wallet('B');let finish;const f=await load({wallets:[a.w,b.w]});f.window.localStorage.setItem('iq6900_solana_wallet','A');a.w.features['standard:connect'].connect=()=>new Promise(resolve=>{finish=resolve;});const old=f.api.connectWallet({cluster:'devnet',onlyIfTrusted:true});await new Promise(resolve=>setTimeout(resolve,0));await f.api.connectWallet({cluster:'devnet',walletId:'B'});const current=f.api.getWalletProvider();finish({accounts:[account()]});assert.equal(await old,null);assert.equal(f.api.getWalletProvider(),current);assert.equal(f.window.localStorage.getItem('iq6900_solana_wallet'),'B');f.close();});
test('explicit disconnect wins against an in-flight connection',async()=>{const j=wallet();let finish;j.w.features['standard:connect'].connect=()=>new Promise(resolve=>{finish=resolve;});const f=await load({wallets:[j.w]});const connecting=f.api.connectWallet({cluster:'devnet'});await new Promise(resolve=>setTimeout(resolve,0));f.api.disconnectWallet();finish({accounts:[account()]});await assert.rejects(connecting,/connection changed/);assert.equal(f.api.getWalletProvider(),null);f.close();});
test('legacy Solflare restore is silent and Standard registration is preferred',async()=>{let calls=0;const legacy={isSolflare:true,publicKey:null,connect:async()=>{calls++;legacy.publicKey=signer.publicKey;},signTransaction:async()=>{}};const f=await load({legacy});assert.equal(await f.api.connectWallet({onlyIfTrusted:true,cluster:'devnet'}),null);assert.equal(calls,0);await f.api.connectWallet({cluster:'devnet'});assert.equal(calls,1);const j=wallet('Solflare');f.wallets.push(j.w);assert.equal(f.api.listWallets('devnet').length,1);assert.notEqual(f.api.listWallets('devnet')[0].provider,legacy);f.close();});
test('bridge-only Solflare uses official SDK per cluster without prompting on entry',async()=>{const f=await load({bridge:true});assert.equal(f.api.listWallets('devnet')[0].id,'Solflare');assert.equal(f.sdkInstances[0].config.network,'devnet');assert.equal(await f.api.connectWallet({onlyIfTrusted:true,cluster:'devnet'}),null);assert.equal(f.sdkInstances[0].publicKey,null);await f.api.connectWallet({cluster:'devnet'});assert.equal(f.api.getWalletProvider(),f.sdkInstances[0]);f.close();});
test('built official registry discovers and unregisters wallets using real events',async()=>{const f=await load({built:true}),j=wallet();let unregister;f.window.dispatchEvent(new f.window.CustomEvent('wallet-standard:register-wallet',{detail:api=>{unregister=api.register(j.w);}}));assert.equal(f.api.listWallets('devnet')[0].id,'Jupiter');await f.api.connectWallet({cluster:'devnet'});unregister();assert.equal(f.api.listWallets('devnet').length,0);f.close();});
test('built Android transport registers without a signing or network request on entry',async()=>{const f=await load({built:true,ua:android});const choices=f.api.listWallets('devnet');assert.equal(choices.length,1);assert.equal(choices[0].name,'Use installed wallet');assert.equal(f.api.getWalletProvider(),null);f.close();});
test('built SDK detects bridge-only Solflare without injecting its connect iframe on entry',async()=>{const f=await load({built:true,bridge:true});assert.equal(f.api.listWallets('devnet')[0].id,'Solflare');assert.equal(await f.api.connectWallet({onlyIfTrusted:true,cluster:'devnet'}),null);assert.equal(f.window.document.querySelectorAll('iframe').length,0);f.close();});

test('same-adapter stale restore cannot mutate the newly selected account',async()=>{
 const j=wallet(),f=await load({wallets:[j.w]});let finish;
 j.w.features['standard:connect'].connect=options=>options?.silent?new Promise(resolve=>{finish=resolve;}):Promise.resolve({accounts:[account()]});
 const restore=f.api.connectWallet({onlyIfTrusted:true,cluster:'devnet'});await new Promise(resolve=>setTimeout(resolve,0));
 await f.api.connectWallet({cluster:'devnet'});const p=f.api.getWalletProvider(),old=account();old.address='11111111111111111111111111111111';old.publicKey=new Uint8Array(32);
 finish({accounts:[old]});assert.equal(await restore,null);assert.equal(p.publicKey.toBase58(),signer.publicKey.toBase58());f.close();
});
test('a real account change during connect is not overwritten by the pending response',async()=>{
 const j=wallet(),f=await load({wallets:[j.w]});let finish;j.w.features['standard:connect'].connect=()=>new Promise(resolve=>{finish=resolve;});
 const pending=f.api.connectWallet({cluster:'devnet'});await new Promise(resolve=>setTimeout(resolve,0));const changed=account();changed.address='11111111111111111111111111111111';changed.publicKey=new Uint8Array(32);j.emit([changed]);finish({accounts:[account()]});
 await assert.rejects(pending,/account changed/);assert.equal(f.api.getWalletProvider(),null);f.close();
});
test('same-account refresh during signing preserves a valid signature',async()=>{
 const j=wallet(),f=await load({wallets:[j.w]});await f.api.connectWallet({cluster:'devnet'});j.w.features['solana:signMessage'].signMessage=async request=>{j.emit([account()]);return[{signature:nacl.sign.detached(request.message,signer.secretKey)}];};
 const msg=new TextEncoder().encode('same account refresh');const out=await f.api.getWalletProvider().signMessage(msg);assert.ok(nacl.sign.detached.verify(msg,out.signature,signer.publicKey.toBytes()));f.close();
});
test('built MWA does not silently restore a cached authorization from the other chain',async()=>{
 const f=await load({built:true,ua:android});f.window.localStorage.setItem('SolanaMobileWalletAdapterDefaultAuthorizationCache',JSON.stringify({chain:'solana:mainnet',accounts:[{...account('solana:mainnet'),chains:['solana:mainnet','solana:devnet']}],capabilities:{supported_transaction_versions:['legacy',0],features:['solana:signTransactions']},auth_token:'synthetic-test-token'}));
 assert.equal(await f.api.connectWallet({cluster:'devnet',onlyIfTrusted:true}),null);assert.equal(f.api.getWalletProvider(),null);f.close();
});

test('official Solflare browse URL is user-clicked, mobile-only and preserves collection route',async()=>{
 const f=await load({ua:'iPhone Mobile Safari',url:'https://iqlabs.dev/?menu=nft&nft=example'});const link=new URL(f.api.solflareBrowseUrl());assert.equal(link.origin,'https://solflare.com');assert.equal(decodeURIComponent(link.pathname.slice('/ul/v1/browse/'.length)),'https://iqlabs.dev/?menu=nft&nft=example');assert.equal(link.searchParams.get('ref'),'https://iqlabs.dev');assert.equal(f.window.location.hostname,'iqlabs.dev');f.close();
 for(const options of[{ua:'desktop',url:'https://iqlabs.dev'},{ua:'iPhone Mobile Safari'},{ua:'iPhone Mobile Safari',url:'https://localhost'}]){const x=await load(options);assert.equal(x.api.solflareBrowseUrl(),null);x.close();}
});

test('actual burner module derives the same public wallet through Standard and legacy signing',async()=>{
 const j=wallet(),f=await load({wallets:[j.w]});await f.api.connectWallet({cluster:'devnet'});
 const context=vm.createContext({crypto:globalThis.crypto,TextEncoder,Uint8Array});const mod=new vm.SourceTextModule(await readFile(new URL('../../../assets/js/codein/burner.js',import.meta.url),'utf8'),{context});
 await mod.link(()=>new vm.SyntheticModule(['Keypair'],function(){this.setExport('Keypair',web3.Keypair);},{context}));await mod.evaluate();
 const legacy=await mod.namespace.deriveBurner(async message=>nacl.sign.detached(message,signer.secretKey));
 const standard=await mod.namespace.deriveBurner(async message=>(await f.api.getWalletProvider().signMessage(message)).signature);
 assert.equal(standard.publicKey.toBase58(),legacy.publicKey.toBase58());f.close();
});
test('versioned transaction signing preserves its compiled message and verified signature',async()=>{
 const j=wallet(),f=await load({wallets:[j.w]});await f.api.connectWallet({cluster:'devnet'});
 j.w.features['solana:signTransaction'].signTransaction=async request=>{const tx=web3.VersionedTransaction.deserialize(request.transaction);tx.sign([signer]);return[{signedTransaction:tx.serialize()}];};
 const msg=new web3.TransactionMessage({payerKey:signer.publicKey,recentBlockhash:signer.publicKey.toBase58(),instructions:[web3.SystemProgram.transfer({fromPubkey:signer.publicKey,toPubkey:signer.publicKey,lamports:0})]}).compileToV0Message();
 const tx=new web3.VersionedTransaction(msg),signed=await f.api.getWalletProvider().signTransaction(tx);assert.equal(signed.version,0);assert.deepEqual(signed.message.serialize(),msg.serialize());assert.ok(nacl.sign.detached.verify(msg.serialize(),signed.signatures[0],signer.publicKey.toBytes()));f.close();
});

test('Phantom uses its registered logo without changing the legacy signing provider',async()=>{
 const j=wallet('Phantom'),f=await load({wallets:[j.w]});const legacy={publicKey:signer.publicKey,connect:async()=>{}};f.window.phantom={solana:legacy};j.w.icon='data:image/png;base64,cGhhbnRvbQ==';
 const choices=f.api.listWallets('devnet');assert.equal(choices.length,1);assert.equal(choices[0].icon,j.w.icon);assert.equal(choices[0].provider,legacy);f.close();
});
