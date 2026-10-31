import{test}from'node:test';import assert from'node:assert/strict';
import{createPackPageTransport}from'../../../assets/js/sections/pages/pack-transport.mjs';
const collection='11111111111111111111111111111111',program='22222222222222222222222222222222',base='https://iqlabs.dev/?menu=packs';
const config={collection,program,chain:'solana:devnet',mediaOrigins:['https://gateway.iqlabs.dev']};
const snapshot=()=>({collectionAddress:collection,program,chain:'solana:devnet',packs:[],traits:[],stock:[{id:0,remaining:4}],receipts:[],avatar:{exists:false},pagination:{before:null,nextBefore:null}});
test('production state reads only the configured API and public holder address',async t=>{
 const old=global.fetch;t.after(()=>global.fetch=old);let requested;
 global.fetch=async(url,options)=>{requested={url:String(url),options};return Response.json(snapshot());};
 const transport=createPackPageTransport(config,base);assert.equal((await transport.read(collection)).collectionAddress,collection);
 assert.equal(requested.url,'https://iqlabs.dev/packs/'+collection+'/state?owner='+collection);assert.equal(requested.options.cache,'no-store');assert.equal(requested.options.credentials,'omit');
 assert.equal(transport.media('https://gateway.iqlabs.dev/img/ref'),'https://gateway.iqlabs.dev/img/ref');
 assert.throws(()=>createPackPageTransport(config,base+'&collection='+program),/configured pack/);
 assert.throws(()=>transport.media('https://unconfigured.example/art.png'),/Unverified/);assert.throws(()=>createPackPageTransport({...config,apiBase:'https://evil.example'},base),/this site/);
});
test('wrong network, collection and oversized state fail closed',async t=>{
 const old=global.fetch;t.after(()=>global.fetch=old);let value=snapshot();global.fetch=async()=>Response.json(value);
 const transport=createPackPageTransport(config,base);
 value.chain='solana:mainnet';await assert.rejects(()=>transport.read(),/configured network/);
 value=snapshot();value.collectionAddress=program;await assert.rejects(()=>transport.read(),/configured network/);
 value=snapshot();value.traits=Array(263).fill({});await assert.rejects(()=>transport.read(),/bounded/);
});
test('trait media must come from the configured gateway and no test action route exists',async t=>{
 const old=global.fetch;t.after(()=>global.fetch=old);const value=snapshot();value.traits=[{address:collection,definition:0,slot:0,image:'https://gateway.iqlabs.dev/img/confirmed'}];global.fetch=async()=>Response.json(value);
 const transport=createPackPageTransport(config,base);assert.equal((await transport.read()).traits[0].image,value.traits[0].image);assert.equal('action'in transport,false);
 value.traits[0].image=null;await assert.rejects(()=>transport.read(),/artwork is not available/);
 value.traits[0].image='https://user:password@gateway.iqlabs.dev/art';await assert.rejects(()=>transport.read(),/Unverified/);
});

test('a separate network API is usable only through the explicit preset origin allowlist',async t=>{
 const old=global.fetch;t.after(()=>global.fetch=old);let requested;global.fetch=async url=>{requested=String(url);return Response.json(snapshot());};
 const transport=createPackPageTransport({...config,apiBase:'https://nft.iqlabs.dev',apiOrigins:['https://nft.iqlabs.dev']},base);await transport.read(collection);assert.equal(requested,'https://nft.iqlabs.dev/packs/'+collection+'/state?owner='+collection);
 assert.throws(()=>createPackPageTransport({...config,apiBase:'https://nft.iqlabs.dev.evil',apiOrigins:['https://nft.iqlabs.dev']},base),/explicitly configured/);
 for(const allowed of ['https://user:password@nft.iqlabs.dev','https://nft.iqlabs.dev/path','http://public.example'])assert.throws(()=>createPackPageTransport({...config,apiOrigins:[allowed]},base),/Invalid configured/);
});
test('a confirmed write asks the configured cache for receipt-verified fresh state',async t=>{
 const old=global.fetch;t.after(()=>global.fetch=old);let requested;
 global.fetch=async url=>{requested=new URL(url);return Response.json(snapshot());};
 const transport=createPackPageTransport(config,base),signature='3'.repeat(88);
 await transport.read(collection,signature);assert.equal(requested.searchParams.get('after'),signature);
 await assert.rejects(()=>transport.read(collection,'not-a-signature'),/receipt/);
 await transport.read(collection);assert.equal(requested.searchParams.has('after'),false);
});
test('a My NFTs deep link preserves the selected asset and rejects a mismatched holder result',async t=>{
 const old=global.fetch;t.after(()=>global.fetch=old);const asset='33333333333333333333333333333333';let requested,value=snapshot();value.avatar={address:asset,owner:collection};global.fetch=async url=>{requested=new URL(url);return Response.json(value);};
 const transport=createPackPageTransport(config,base+'&collection='+collection+'&asset='+asset);
 await transport.read();assert.equal(requested.searchParams.has('asset'),false);
 await transport.read(collection);assert.equal(requested.searchParams.get('asset'),asset);
 value.avatar={address:program,owner:collection};await assert.rejects(()=>transport.read(collection),/Selected NFT/);
 value.avatar={address:asset,owner:program};await assert.rejects(()=>transport.read(collection),/ownership/);
 assert.throws(()=>createPackPageTransport(config,base+'&asset=not-a-key'),/Invalid selected NFT/);
});
