const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const jquery=require('jquery');
const assets=path.resolve(__dirname,'../assets');
const id='e97c120e-3525-4b9f-95b7-277145e8ef4c';
const signature='2'.repeat(88);

async function mount(t,origin='https://blockchan.sol.site',fail=false){
 const url=new URL('https://iqlabs.dev/?menu=codein');
 url.searchParams.set('attachmentOrigin',origin);url.searchParams.set('attachmentRequest',id);
 const dom=new JSDOM('<div id="main_section"></div>',{url:url.href,runScripts:'outside-only'});
 t.after(()=>dom.window.close());const w=dom.window;
 w.$=w.jQuery=jquery(w);w.TextEncoder=TextEncoder;
 const sent=[];w.opener={closed:false,postMessage:(data,target)=>sent.push({data,target})};
 let writes=0,boardReads=0;
 w.phantom={solana:{publicKey:{toString:()=> 'local-user'},connect:async()=>({publicKey:'local-user'})}};
 w.iqCodein={cluster:'mainnet-beta',hasOwnRpc:()=>false,estimateCost:()=>({chunks:1,total:1}),
  viewUrl:sig=>'https://iqlabs.dev/?menu=codein&post='+sig,readBoard:async()=>{boardReads++;return {rows:[]};},getSpeed:()=> 'auto',recommendSpeed:()=> 'light',
  connect:()=>({}),deriveBurner:async()=>({}),sweep:async()=>0,
  inscribe:async()=>{writes++;if(fail)throw new Error('fixture upload rejected');return {sig:signature};},notify:async()=>false};
 w.$.ajax=({success})=>success(fs.readFileSync(path.join(assets,'html/sections/code_in_v2.html'),'utf8'));
 w.eval(fs.readFileSync(path.join(assets,'js/sections/pages/code_in_v2.js'),'utf8'));
 w.$.code_in_v2.init();await new Promise(setImmediate);
 return {w,sent,writes:()=>writes,boardReads:()=>boardReads,upload:async()=>{
   const input=w.document.querySelector('#ci2_file_file');
   Object.defineProperty(input,'files',{value:[new w.File([new Uint8Array([1,2,3])],'fixture.wav',{type:'audio/wav'})]});
   w.$(input).trigger('change');
   await new Promise(resolve=>w.setTimeout(resolve,20));
   w.$('#ci2_go').trigger('click');await new Promise(resolve=>w.setTimeout(resolve,20));
 }};
}
test('existing uploader automatically returns confirmed media and waits for the matching acknowledgement',async t=>{
 const {w,sent,upload,writes,boardReads}=await mount(t);
 assert.equal(sent[0].data.type,'iq:attachment-ready');
 assert.equal(w.$('#ci2_modal').hasClass('hide'),false);
 await upload();assert.equal(writes(),1);assert.equal(w.$('#ci2_share_link').val(),'https://iqlabs.dev/?menu=codein&post='+signature);assert.equal(w.$('#ci2_open_link').attr('href'),w.$('#ci2_share_link').val());assert.equal(boardReads(),0,"attachment flow should not fetch the public feed");
 assert.deepEqual(JSON.parse(JSON.stringify(sent[1])),{target:'https://blockchan.sol.site',data:{type:'iq:attachment-complete',requestId:id,network:'solana',signature}});
 w.dispatchEvent(new w.MessageEvent('message',{origin:'https://wrong.invalid',source:w.opener,data:{type:'iq:attachment-accepted',requestId:id}}));
 assert.match(w.$('#ci2_return_status').text(),/Returning/);
 w.dispatchEvent(new w.MessageEvent('message',{origin:'https://blockchan.sol.site',source:w.opener,data:{type:'iq:attachment-accepted',requestId:id}}));
 assert.match(w.$('#ci2_return_status').text(),/Attachment added/);
});
test('failed inscription never sends a completion',async t=>{
 const {sent,upload}=await mount(t,'https://hoodchan.xyz',true);await upload();
 assert.equal(sent.filter(x=>x.data.type==='iq:attachment-complete').length,0);
});
for(const origin of ['https://blockchan.sol.site.evil.invalid','https://blockchan.sol.site/path','null','http://localhost:3207']){
 test('production uploader rejects return origin '+origin,async t=>{
  const {sent,w}=await mount(t,origin);assert.equal(sent.length,0);assert.equal(w.$('#ci2_return').length,0);
 });
}

test('completed link remains available when the posting window has closed',async t=>{
 const {w,upload,sent}=await mount(t);w.opener.closed=true;
 await upload();
 assert.equal(w.$('#ci2_share_link').val(),'https://iqlabs.dev/?menu=codein&post='+signature);
 assert.equal(sent.filter(x=>x.data.type==='iq:attachment-complete').length,0);
 w.$('#ci2_copy_link').trigger('click');await new Promise(setImmediate);
 assert.match(w.$('#ci2_link_status').text(),/Select and copy/);
 assert.equal(w.document.activeElement.id,'ci2_share_link');
});
