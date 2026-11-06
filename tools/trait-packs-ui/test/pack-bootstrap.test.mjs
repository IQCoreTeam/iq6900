import{test}from'node:test';import assert from'node:assert/strict';import{createRequire}from'node:module';import path from'node:path';import{readFile}from'node:fs/promises';
import{createPackBootstrap,createPackPendingStorage,assertPackRuntime}from'../../../assets/js/codein/pack_bootstrap.mjs';
if(!process.env.IQ_PACK_CLIENT_ROOT)throw Error('Set IQ_PACK_CLIENT_ROOT to the reviewed companion client checkout');
const{PublicKey,Keypair}=createRequire(path.join(process.env.IQ_PACK_CLIENT_ROOT,'package.json'))('@solana/web3.js');
const key=()=>Keypair.generate().publicKey.toBase58();
function fixture(){
 const target={location:{href:'https://iqlabs.dev/?menu=nft-create'}},registry={get:()=>[],on:()=>()=>{}},pins={program:key(),nftProgram:key(),provider:key(),providerTreasury:key(),windowRequests:false};
 let network='devnet',api='https://nft.iqlabs.dev',rpc='https://api.devnet.solana.com',loads=0,registries=0,endpointReads=0,healthOverride=null;
 const presets={devnet:{api:'https://nft.iqlabs.dev',gateway:'https://dev-gateway.iqlabs.dev',packs:null},mainnet:{api:'https://nft-main.example',gateway:'https://gateway.iqlabs.dev',packs:null}},storage=new Map();
 const bootstrap=createPackBootstrap({target,getPreset:()=>presets[network],getNetwork:()=>network,getRpc:()=>{endpointReads++;return rpc;},getApi:()=>{endpointReads++;return api;},getHealth:async()=>healthOverride??{ok:true,cluster:network,programId:presets[network].packs?.nftProgram},loadClient:async()=>{loads++;return{PublicKey,getWallets:()=>{registries++;return registry;}};},getStorage:()=>({getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}),enableOutfits:async args=>args});
 return{target,registry,pins,presets,bootstrap,setNetwork(value){network=value;},setHealth(value){healthOverride=value;},setApi(value){api=value;},setRpc(value){rpc=value;},get counts(){return{loads,registries,endpointReads};}};
}
test('optional packs stay off without importing a client, registry, storage or RPC',async()=>{
 const f=fixture();assert.deepEqual(await f.bootstrap(),{enabled:false});assert.deepEqual(f.counts,{loads:0,registries:0,endpointReads:0});assert.equal(f.target.iqPackCreatorConfig,undefined);assert.equal(f.target.iqPackConfig,undefined);
 const template=await readFile(new URL('../../../assets/html/sections/nft_studio.html',import.meta.url),'utf8');assert.match(template,/<section class="pack-setup-panel"[^>]* hidden>/);
 const network=await readFile(new URL('../../../assets/js/codein/nft_net.js',import.meta.url),'utf8');assert.equal((network.match(/packs: null/g)||[]).length,2);
});
test('native setup shares one registry across creator and each collection URL',async()=>{
 const f=fixture();f.presets.devnet.packs=f.pins;await f.bootstrap();const creator=f.target.iqPackCreatorConfig;
 assert.equal(creator.registry,f.registry);assert.equal(creator.chain,'solana:devnet');assert.equal(creator.apiPath,'/creator/packs');assert.equal(f.target.iqPackConfig,undefined);
 const first=key(),second=key();f.target.location.href='https://iqlabs.dev/?menu=packs&collection='+first;await f.bootstrap();const a=f.target.iqPackConfig;
 assert.equal(a.registry,f.registry);assert.equal(a.collection,first);assert.equal(a.program,f.pins.program);assert.equal(a.mediaOrigins[0],'https://dev-gateway.iqlabs.dev');
 f.target.location.href='https://iqlabs.dev/?menu=packs&collection='+second;await f.bootstrap();assert.equal(f.target.iqPackConfig.collection,second);assert.equal(f.target.iqPackConfig.registry,creator.registry);assert.equal(f.counts.loads,1);assert.equal(f.counts.registries,1);
 assert.equal((await a.enableOutfits({wallet:{},account:{},asset:key()})).collection,first);
 f.target.location.href='https://iqlabs.dev/?menu=nft-create';await f.bootstrap();assert.equal(f.target.iqPackConfig,undefined);
});
test('network deployment pins and backend overrides fail closed unless explicit',async()=>{
 const f=fixture();f.presets.devnet.packs={...f.pins,providerTreasury:undefined};await assert.rejects(()=>f.bootstrap(),/pins are incomplete/);assert.equal(f.counts.loads,0);assert.equal(f.target.iqPackCreatorConfig,undefined);
 f.presets.devnet.packs={...f.pins,windowRequests:undefined};await assert.rejects(()=>f.bootstrap(),/policy explicitly/);assert.equal(f.counts.loads,0);
 f.presets.devnet.packs=f.pins;f.setApi('https://unknown.example');await assert.rejects(()=>f.bootstrap(),/not in this network preset/);assert.equal(f.counts.loads,0);
 f.presets.devnet.packs={...f.pins,apiOrigins:['http://127.0.0.1:4564']};f.setApi('http://127.0.0.1:4564');f.setRpc('https://devnet.helius.example/?api-key=test-only');await f.bootstrap();assert.equal(f.target.iqPackCreatorConfig.apiBase,'http://127.0.0.1:4564');assert.equal(f.target.iqPackCreatorConfig.rpc,'https://devnet.helius.example/?api-key=test-only');
 const mainPins={...f.pins,program:key(),windowRequests:true};f.presets.mainnet.packs=mainPins;f.setNetwork('mainnet');f.setApi('https://nft-main.example');f.setRpc('https://mainnet.example');await f.bootstrap();assert.equal(f.target.iqPackCreatorConfig.chain,'solana:mainnet');assert.equal(f.target.iqPackCreatorConfig.deployment.program,mainPins.program);assert.equal(f.counts.registries,1);
});
test('durable pending storage clears only a matching receipt',async()=>{
 const data=new Map(),storage=createPackPendingStorage(()=>({getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)}),'iq-pack-purchase:');
 await storage.save('same-key',{signature:'first',epoch:0});assert.equal(data.has('iq-pack-purchase:same-key'),true);await storage.clear('same-key','other');assert.equal((await storage.load('same-key')).signature,'first');await storage.clear('same-key','first');assert.equal(await storage.load('same-key'),null);
});

test('disabling a native preset clears only its own prior configuration and preserves explicit QA ownership',async()=>{
 const f=fixture();f.presets.devnet.packs=f.pins;f.target.location.href+='&collection='+key();await f.bootstrap();assert(f.target.iqPackCreatorConfig);assert(f.target.iqPackConfig);f.presets.devnet.packs=null;await f.bootstrap();assert.equal(f.target.iqPackCreatorConfig,undefined);assert.equal(f.target.iqPackConfig,undefined);
 const explicit={deployment:{program:'QA-owned'}};f.target.iqPackCreatorConfig=explicit;await f.bootstrap();assert.equal(f.target.iqPackCreatorConfig,explicit);
});

test('backend cluster and NFT program must match before a configured feature can load',async()=>{
 const f=fixture();f.presets.devnet.packs=f.pins;f.setHealth({ok:true,cluster:'mainnet',programId:f.pins.nftProgram});await assert.rejects(()=>f.bootstrap(),/backend network or NFT program/);assert.equal(f.counts.loads,0);assert.equal(f.target.iqPackCreatorConfig,undefined);
 f.setHealth({ok:true,cluster:'devnet',programId:key()});await assert.rejects(()=>f.bootstrap(),/backend network or NFT program/);assert.equal(f.counts.loads,0);
});

test('native pack methods accept localnet only with loopback pins and explicit genesis',()=>{
 const f=fixture(),deployment=f.pins,current={hostname:'127.0.0.1',network:'devnet',rpc:'https://api.devnet.solana.com',api:'https://nft.iqlabs.dev',gateway:'https://dev-gateway.iqlabs.dev'};
 const local={deployment,chain:'solana:localnet',localGenesis:'pinned-test-genesis',rpc:'http://127.0.0.1:8899',apiBase:'http://127.0.0.1:4568',gateway:'http://127.0.0.1:4568'};assert.equal(assertPackRuntime(local,current),local);
 assert.throws(()=>assertPackRuntime({...local,localGenesis:null},current),/loopback endpoints and a pinned genesis/);assert.throws(()=>assertPackRuntime(local,{...current,hostname:'iqlabs.dev'}),/loopback endpoints and a pinned genesis/);
 for(const field of ['rpc','apiBase','gateway'])assert.throws(()=>assertPackRuntime({...local,[field]:'https://public.example'},current),/loopback endpoints and a pinned genesis/);
 const devnet={deployment,chain:'solana:devnet',rpc:current.rpc,apiBase:current.api,gateway:current.gateway};assert.equal(assertPackRuntime(devnet,current),devnet);assert.throws(()=>assertPackRuntime(devnet,{...current,network:'mainnet'}),/NFT pack network/);assert.throws(()=>assertPackRuntime(devnet,{...current,rpc:'https://other.example'}),/NFT pack network/);
});
