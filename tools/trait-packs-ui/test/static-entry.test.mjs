import{test}from'node:test';import assert from'node:assert/strict';import{readFile,access}from'node:fs/promises';
const assets=new URL('../../../assets/',import.meta.url);
test('the existing site entry routes to the actual packs module and preserves ordinary NFT entrypoints',async()=>{
 const index=await readFile(new URL('index.html',assets),'utf8'),init=await readFile(new URL('js/init.js',assets),'utf8');
 assert.match(init,/menu == "packs"/);assert.match(init,/sections\/pages\/nft_packs\.js/);assert.match(init,/\$\.nft_launch\.init/);assert.match(init,/\$\.nft_studio\.init/);
 for(const match of index.matchAll(/<script[^>]+src="([^"?]+)(?:\?[^\"]*)?"/g))if(!/^https?:/.test(match[1]))await access(new URL(match[1],assets));
 await access(new URL('js/sections/pages/nft_packs.js',assets));await access(new URL('js/sections/pages/nft_pack_creator.js',assets));await access(new URL('js/codein/pack_bootstrap.mjs',assets));
});
test('public pack template uses generic branding and normal CSS paths, not private preview assets',async()=>{
 const template=await readFile(new URL('html/sections/nft_packs.html',assets),'utf8'),controller=await readFile(new URL('js/sections/pages/nft_packs.js',assets),'utf8');
 assert.equal(/\/qa\/|\/base\/|NUBBIES|Nubbies|tester-control/.test(template),false);assert.equal(/__packs|pack-browser-signer|browserSigner|Test wallet/.test(controller),false);
 for(const match of template.matchAll(/href="(\/css\/[^\"]+)"/g))await access(new URL(match[1].slice(1),assets));
 const arrow=await readFile(new URL('img/right_arrow.svg',assets),'utf8');assert.match(arrow,/<svg\b/);assert.match(arrow,/<\/svg>\s*$/);
 const foil=await readFile(new URL('img/trait-pack-foil.png',assets));assert.equal(foil.subarray(1,4).toString(),'PNG');
});
