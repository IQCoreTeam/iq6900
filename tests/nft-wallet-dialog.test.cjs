const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const jquery=require('jquery');
async function mount(t,wallets){
 const d=new JSDOM('',{url:'https://iqlabs.dev/?menu=nft',runScripts:'outside-only'});t.after(()=>d.window.close());const w=d.window;w.$=w.jQuery=jquery(w);w.$('body').append(fs.readFileSync('../assets/html/sections/nft_launch.html','utf8'));w.iqNft={wallets:()=>wallets};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;this.querySelector('button')?.focus();};
 w.HTMLDialogElement.prototype.close=function(v){this.returnValue=v;this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.eval(fs.readFileSync('../assets/js/sections/pages/nft_launch.js','utf8'));return w;
}
test('NFT wallet picker keeps every choice in one labelled bounded native dialog',async t=>{
 const wallets=Array.from({length:8},(_,i)=>({id:'wallet-'+i,name:'Wallet '+i}));const w=await mount(t,wallets),picked=w.$.nft_launch.pickWallet();const d=w.document.querySelector('dialog');
 assert.equal(d.open,true);assert.equal(d.getAttribute('aria-label'),'Connect a wallet');assert.equal(d.style.maxHeight,'calc(100dvh - 32px)');assert.equal(d.style.overflowY,'auto');assert.equal(d.querySelectorAll('button').length,9);
 d.querySelectorAll('button')[7].click();assert.equal(await picked,'wallet-7');assert.equal(w.document.querySelector('dialog'),null);
});
test('cancel closes without choosing a wallet and duplicate open does not create another dialog',async t=>{
 const w=await mount(t,[{id:'a',name:'A'}]),p=w.$.nft_launch.pickWallet();assert.equal(await w.$.nft_launch.pickWallet(),null);w.$('dialog button').last().trigger('click');assert.equal(await p,null);assert.equal(w.document.querySelectorAll('dialog').length,0);
});
test('empty picker explains mobile wallet browser rather than requiring an extension',async t=>{
 const w=await mount(t,[]),p=w.$.nft_launch.pickWallet();assert.match(w.document.querySelector('dialog').textContent,/On mobile, open this page in your wallet app/);w.$('dialog button').trigger('click');assert.equal(await p,null);
});
test('wallet labels are escaped text and the account pill is a native button',async t=>{
 const w=await mount(t,[{id:'a',name:'<img src=x onerror=alert(1)>'}]),p=w.$.nft_launch.pickWallet();assert.equal(w.document.querySelector('dialog img'),null);assert.match(w.document.querySelector('dialog button').textContent,/<img/);w.$('dialog button').last().trigger('click');await p;
 const html=fs.readFileSync('../assets/html/sections/nft_launch.html','utf8');const doc=new JSDOM(html).window.document,pill=doc.querySelector('#nftl_who');assert.equal(pill.tagName,'BUTTON');assert.equal(pill.getAttribute('aria-label'),'Change wallet');
});

test('account change updates the NFT header and disconnect clears it without reloading',async t=>{
 const w=await mount(t,[]),listeners=new Map();let addr='first-wallet';const p={on:(e,f)=>listeners.set(e,f),removeListener:(e,f)=>{if(listeners.get(e)===f)listeners.delete(e);}};let active=p;
 Object.assign(w.iqNft,{getWalletProvider:()=>active,disconnect:()=>{active=null;}});const page=w.$.nft_launch;page.setWallet(addr,true);
 assert.equal(w.$('#nftl_who span').text(),'firs...llet');addr='second-wallet';listeners.get('accountChanged')({toBase58:()=>addr});assert.equal(page.wallet,addr);assert.equal(w.$('#nftl_who span').text(),'seco...llet');
 listeners.get('disconnect')();assert.equal(page.wallet,null);assert.equal(w.$('#nftl_who').css('display'),'none');assert.notEqual(w.$('#nftl_hconnect').css('display'),'none');assert.equal(listeners.size,0);
});
test('new wallet selection removes listeners from the previous provider',async t=>{
 const w=await mount(t,[]),a=new Map(),b=new Map();const provider=map=>({on:(e,f)=>map.set(e,f),removeListener:(e,f)=>{if(map.get(e)===f)map.delete(e);}});let active=provider(a);Object.assign(w.iqNft,{getWalletProvider:()=>active});w.$.nft_launch.setWallet('A',true);active=provider(b);w.$.nft_launch.setWallet('B',true);assert.equal(a.size,0);assert.equal(b.size,2);
});
test('late page restore does not overwrite a newer explicit selection',async t=>{
 const w=await mount(t,[]);let finish;Object.assign(w.iqNft,{restore:()=>new Promise(resolve=>{finish=resolve;}),connect:async()=> 'new-wallet'});const page=w.$.nft_launch;page.wireNav();await page.connectFlow(false);finish('old-wallet');await new Promise(setImmediate);assert.equal(page.wallet,'new-wallet');
});
test('disconnect invalidates a pending My NFTs request before clearing holdings',async t=>{
 const w=await mount(t,[]);let address='old-wallet',finish;Object.assign(w.iqNft,{connected:()=>address,getHeld:()=>new Promise(resolve=>{finish=resolve;})});const page=w.$.nft_launch;const old=page.renderMine();address=null;await page.renderMine();finish([]);await old;assert.match(w.$('#nftl_mine').text(),/CONNECT TO SEE YOURS/);assert.doesNotMatch(w.$('#nftl_mine').text(),/0 NFTS/);
});

test('no detected wallet opens the mobile fallback instead of an unreachable error-only screen',async t=>{
 const w=await mount(t,[]);w.alert=()=>assert.fail('should show wallet dialog');Object.assign(w.iqNft,{connect:async()=>{throw Error('No Solana wallet found.');},solflareBrowseUrl:()=> 'https://solflare.com/ul/v1/browse/https%3A%2F%2Fiqlabs.dev%2F?ref=https%3A%2F%2Fiqlabs.dev'});
 const pending=w.$.nft_launch.connectFlow(false);await new Promise(setImmediate);assert.equal(w.document.querySelector('dialog').open,true);assert.equal(w.$('dialog a').text(),'OPEN IN SOLFLARE');w.$('dialog button').trigger('click');await pending;
});

test('old provider events cannot orphan the selected wallet while a replacement connects',async t=>{
 const w=await mount(t,[]),oldListeners=new Map(),newListeners=new Map();const p=map=>({on:(e,f)=>map.set(e,f),removeListener:(e,f)=>{if(map.get(e)===f)map.delete(e);}});let active=p(oldListeners),finish;
 Object.assign(w.iqNft,{getWalletProvider:()=>active,connected:()=>active===next?'new-wallet':'old-wallet',connect:()=>new Promise(resolve=>{finish=()=>{active=next;resolve('new-wallet');};})});const next=p(newListeners),page=w.$.nft_launch;page.setWallet('old-wallet',true);
 const pending=page.connectFlow(false);assert.equal(oldListeners.size,0);oldListeners.get('accountChanged')?.({toBase58:()=> 'old-wallet-2'});finish();await pending;assert.equal(page.wallet,'new-wallet');assert.equal(page.walletProvider,next);assert.equal(newListeners.size,2);
});
test('failed replacement rebinds and refreshes the existing provider',async t=>{
 const w=await mount(t,[]),listeners=new Map();const provider={on:(e,f)=>listeners.set(e,f),removeListener:(e,f)=>{if(listeners.get(e)===f)listeners.delete(e);}};let actual='old-wallet';Object.assign(w.iqNft,{getWalletProvider:()=>provider,connected:()=>actual,connect:async()=>{actual='updated-old-wallet';throw Error('rejected');}});w.alert=()=>{};const page=w.$.nft_launch;page.setWallet('old-wallet',true);await page.connectFlow(false);assert.equal(page.wallet,actual);assert.equal(page.walletProvider,provider);assert.equal(listeners.size,2);
});

test('refund notice is separate from minting and its recovery action cannot call mint',async t=>{
 const w=await mount(t,[]);let pending={signature:'known-public-receipt'},returns=0;Object.assign(w.iqNft,{pendingRefund:()=>pending,solscanTx:s=>'https://solscan.io/tx/'+s,retryRefund:async()=>{returns++;pending=null;},mint:()=>assert.fail('must not mint again')});const page=w.$.nft_launch;page.renderRefund();assert.match(w.$('#nftl_refund').text(),/NFT is minted/);assert.equal(w.$('#nftl_refund a').attr('href'),'https://solscan.io/tx/known-public-receipt');w.$('#nftl_refund button').trigger('click');await new Promise(setImmediate);assert.equal(returns,1);assert.equal(w.$('#nftl_refund').css('display'),'none');
});
test('viewer hides absent rarity and preserves a creator-assigned tier',async t=>{
 const w=await mount(t,[]);let rarity=null;Object.assign(w.iqNft,{getAsset:async()=>({name:'NFT',owner:'owner',collection:'collection',metaSig:'M',inscriptionSig:'C',rarity,index:1}),metaUrl:()=>'/meta',viewUrl:()=>'/view',gatewayMeta:async()=>({name:'NFT'}),imgUrl:()=>'/image',explorerCluster:()=>'?cluster=devnet',solscanTx:()=>'/tx'});const page=w.$.nft_launch;page.renderAssetRows=()=>{};page.vcap=()=>{};await page.loadAsset('asset','collection');assert.equal(w.$('#nftl_vrarity').parent().css('display'),'none');rarity={tier:'rare'};await page.loadAsset('asset','collection');assert.equal(w.$('#nftl_vrarity').text(),'rare');assert.notEqual(w.$('#nftl_vrarity').parent().css('display'),'none');
});

test('late viewer data cannot replace a newer NFT or restore a closed viewer',async t=>{
 const w=await mount(t,[]);let resolve;const old=new Promise(done=>{resolve=done;});
 Object.assign(w.iqNft,{getAsset:async addr=>addr==='old'?old:{slug:'ordinary',collection:'collection',name:'New NFT',owner:'seller',index:1,inscriptionSig:'image',metaSig:'meta'},gatewayMeta:async()=>({}),metaUrl:()=>'/meta',viewUrl:()=>'/raw',imgUrl:()=>'/image.png',explorerCluster:()=>''});
 const first=w.$.nft_launch.loadAsset('old','ordinary');await w.$.nft_launch.loadAsset('new','ordinary');resolve({slug:'ordinary',collection:'collection',name:'Old NFT',owner:'seller',index:1,inscriptionSig:'image',metaSig:'meta'});await first;
 assert.equal(w.$.nft_launch.asset.asset,'new');assert.equal(w.$('#nftl_vname').text(),'New NFT');w.$.nft_launch.hideViewer();assert.equal(w.$.nft_launch.asset,null);
});
