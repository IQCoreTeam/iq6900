const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const jquery=require('jquery');
const tick=()=>new Promise(setImmediate);
async function mount(t, connect) {
 const dom=new JSDOM('<div id="main_section"></div>',{url:'https://iqlabs.dev/?menu=codein',runScripts:'outside-only'});t.after(()=>dom.window.close());
 const w=dom.window;w.$=w.jQuery=jquery(w);w.TextEncoder=TextEncoder;w.fetch=async()=>({ok:true,json:async()=>({pairs:[]})});
 const listeners=new Map();const calls=[];let metadata=0,launches=0,registrations=0;
 const key={toString:()=> 'test-wallet',toBase58:()=> 'test-wallet'};
 w.phantom={solana:{publicKey:key,connect:async opts=>{calls.push(opts);return connect?connect(opts):{publicKey:key};},on:(e,f)=>listeners.set(e,f),removeListener:(e,f)=>{if(listeners.get(e)===f)listeners.delete(e);}}};
 const row={kind:'image',body:'data:image/png;base64,AA==',who:'test-wallet',__txSignature:'2'.repeat(88)};
 w.iqCodein={hasOwnRpc:()=>false,estimateCost:()=>({chunks:1,total:1}),readBoard:async()=>({rows:[]}),readMine:async()=>({rows:[row]}),viewUrl:s=>'https://iqlabs.dev/?menu=codein&post='+s,metaUrl:s=>'https://gateway.iqlabs.dev/token-meta/'+s,connect:()=>({}),deriveBurner:async()=>({}),inscribeMeta:async()=>{metadata++;return {sig:'meta'};},inscribe:async()=>{registrations++;return {sig:'registry'};},notify:async()=>{},getSpeed:()=> 'light'};
 w.iqTokenLaunch={GATEWAY:'https://gateway.iqlabs.dev',FEE_SOL:.069,launch:async()=>{launches++;return {mint:'mint',sig:'create'};}};
 w.$.ajax=({success})=>success(fs.readFileSync('assets/html/sections/code_in_v2.html','utf8'));
 w.eval(fs.readFileSync('assets/js/sections/pages/code_in_v2.js','utf8'));w.$.code_in_v2.init();await tick();
 return {w,calls,listeners,counts:()=>({metadata,launches,registrations})};
}
test('trusted reconnect restores UI without signing and disconnect invalidates it',async t=>{
 const v=await mount(t);assert.deepEqual(JSON.parse(JSON.stringify(v.calls)),[{onlyIfTrusted:true}]);
 assert.equal(v.w.$('#ci2_connect').hasClass('hide'),true);assert.deepEqual(v.counts(),{metadata:0,launches:0,registrations:0});
 v.listeners.get('disconnect')();assert.equal(v.w.$('#ci2_connect').hasClass('hide'),false);
});
test('untrusted wallet remains disconnected without interactive fallback',async t=>{
 const v=await mount(t,async()=>{throw Error('not authorized');});assert.equal(v.calls.length,1);assert.equal(v.w.$('#ci2_connect').hasClass('hide'),false);
});
test('late trusted response cannot overwrite an account-change event',async t=>{
 let finish;const v=await mount(t,()=>new Promise(r=>{finish=r;}));v.listeners.get('accountChanged')();finish({publicKey:{toString:()=> 'old-wallet'}});await tick();assert.equal(v.w.$('#ci2_connect').hasClass('hide'),false);
});
test('launch does not trigger registry spending until its separate button is clicked',async t=>{
 const v=await mount(t),$=v.w.$;
 $('#ci2_mk_launch').trigger('click');await tick();$('#ci2_tk_inv .rec').first().trigger('click');$('#ci2_tk_continue').trigger('click');
 $('#ci2_tk_name').val('Test');$('#ci2_tk_symbol').val('TEST');$('#ci2_tk_go').trigger('click');await tick();await tick();
 assert.deepEqual(v.counts(),{metadata:1,launches:1,registrations:0});
 assert.match($('#ci2_tk_regnote').text(),/separate inscription/);
 $('#ci2_tk_reg_retry').trigger('click');$('#ci2_tk_reg_retry').trigger('click');await tick();await tick();
 assert.deepEqual(v.counts(),{metadata:1,launches:1,registrations:1});
});
