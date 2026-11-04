const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom'),jquery=require('jquery');
function fixture(t,sourceRoot){const w=new JSDOM('<main id="main_section"></main>',{url:'http://127.0.0.1/?menu=nft',runScripts:'outside-only'}).window;w.$=w.jQuery=jquery(w);t.after(()=>w.close());w.eval(fs.readFileSync(sourceRoot?path.join(sourceRoot,'assets/js/sections/pages/nft_launch.js'):path.join(__dirname,'../../../assets/js/sections/pages/nft_launch.js'),'utf8'));w.$('#main_section').html(fs.readFileSync(path.join(__dirname,'../../../assets/html/sections/nft_launch.html'),'utf8'));const launch=w.$.nft_launch;launch.dbg=launch.navMid=launch.navBack=()=>{};launch.renderGrid=async()=>{};const col={slug:'supported',name:'Supported',collection:'22222222222222222222222222222222',registry:'44444444444444444444444444444444',creator:'55555555555555555555555555555555',maxSupply:401,minted:1,priceLamports:0,traitPacks:true};w.iqNft={connected:()=> '11111111111111111111111111111111',explorerCluster:()=>'',getCollection:async()=>col,imgUrl:x=>'/img/'+x};return{w,launch,col};}
test('gallery and collection links require explicit finalized support and a configured frontend',async t=>{const{w,launch,col}=fixture(t);assert.equal(launch.card(col).find('a[href*="menu=packs"]').length,0);w.iqPackCreatorConfig={};const supported=launch.card(col);assert.equal(supported.find('a[href*="menu=packs"]').length,1);assert.equal(supported.find('a a').length,0);assert.equal(launch.card({...col,traitPacks:false}).find('a[href*="menu=packs"]').length,0);assert.equal(launch.card({...col,chain:'hood'}).find('a[href*="menu=packs"]').length,0);await launch.load(col.slug);assert.equal(w.$('#nftl_clinks a[href*="menu=packs"]').length,1);col.traitPacks=false;await launch.load(col.slug);assert.equal(w.$('#nftl_clinks a[href*="menu=packs"]').length,0);});
test('My NFTs uses owner holdings and links the supported asset without item-page scans',async t=>{
 const{w,launch,col}=fixture(t);w.iqPackCreatorConfig={};launch.cols=[col,{...col,slug:'standard',maxSupply:1,traitPacks:false}];
 const owner=w.iqNft.connected(),asset='33333333333333333333333333333333',calls=[];
 w.iqNft.getItems=async()=>{throw Error('holdings must not scan item pages');};
 w.iqNft.getHeld=async wallet=>{calls.push(wallet);return[{slug:'supported',collectionName:col.name,index:401,asset,name:'Edition401'},{slug:'standard',collectionName:'Standard',index:1,asset:'66666666666666666666666666666666',name:'Standard'}];};
 await launch.renderMine();assert.deepEqual(calls,[owner]);
 const links=w.$('#nftl_mine a[href*="menu=packs"]');assert.equal(links.length,1);const url=new URL(links.attr('href'),w.location.href);
 assert.equal(url.searchParams.get('collection'),col.collection);assert.equal(url.searchParams.get('asset'),asset);assert.equal(w.$('#nftl_mine a a').length,0);assert.equal(w.$('#nftl_mine a.mc').length,2);
 const {solanaMarketUrl}=await import('../../../assets/nft-market-links.mjs');w.iqNft.marketUrl=asset=>solanaMarketUrl(asset,'solana:mainnet');await launch.renderMine();assert.equal(w.$('#nftl_mine a[href^="https://magiceden.io/item-details/"]').length,2);assert.equal(w.$('#nftl_mine a a').length,0);
});

test('standard branch keeps packs absent and reads held NFTs without scanning collection pages',async t=>{
 if(!process.env.IQ_STANDARD_ROOT){t.skip('Set IQ_STANDARD_ROOT for the separate standard-branch comparison');return;}
 const{w,launch,col}=fixture(t,process.env.IQ_STANDARD_ROOT);w.iqPackCreatorConfig={};
 assert.equal(launch.card(col).find('a[href="?menu=packs"]').length,0);
 await launch.load(col.slug);assert.equal(w.$('#nftl_clinks a[href*="menu=packs"]').length,0);
 launch.cols=[col];const calls=[],owner=w.iqNft.connected();
 w.iqNft.getItems=async()=>{throw Error('Owner holdings must not scan collection item pages');};
 w.iqNft.getHeld=async wallet=>{calls.push(wallet);return[{slug:col.slug,collectionName:col.name,index:201,asset:'33333333333333333333333333333333',name:'Edition 201'}];};
 await launch.renderMine();assert.deepEqual(calls,[owner]);assert.equal(w.$('#nftl_mine a.mc').length,1);
 assert.equal(w.$('#nftl_mine').text().includes('Edition 201'),true);
 assert.equal(w.$('#nftl_mine a[href*="menu=packs"]').length,0);
});

test('Packs browse separates confirmed collections and does not reuse NFT mint prices',async t=>{
 const{w,launch,col}=fixture(t);w.iqPackCreatorConfig={};
 const second={...col,name:'Second packs',slug:'second-packs',collection:'77777777777777777777777777777777'};
 launch.cols=[col,second,{...col,slug:'ordinary',traitPacks:false}];launch.chain='all';launch.tab='packs';launch.page=1;
 assert.equal(launch.visibleCols().length,2);launch.renderCols();
 const links=w.$('#nftl_colgrid a');assert.equal(links.length,2);
 assert.equal(new URL(links.eq(0).attr('href'),w.location.href).searchParams.get('collection'),col.collection);
 assert.equal(new URL(links.eq(1).attr('href'),w.location.href).searchParams.get('collection'),second.collection);
 assert.equal(w.$('#nftl_colgrid a a').length,0);assert.equal(w.$('#nftl_colgrid .segs').length,0);
 assert.doesNotMatch(w.$('#nftl_colgrid').text(),/SOL|minted out/);
});
