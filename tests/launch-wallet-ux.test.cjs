const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const jquery=require('jquery');
const tick=()=>new Promise(setImmediate);
async function mount(t, connect, boardRows = []) {
 const dom=new JSDOM('<div id="main_section"></div>',{url:'https://iqlabs.dev/?menu=codein',runScripts:'outside-only'});t.after(()=>dom.window.close());
 const w=dom.window;w.$=w.jQuery=jquery(w);w.TextEncoder=TextEncoder;w.fetch=async()=>({ok:true,json:async()=>({pairs:[]})});
 const listeners=new Map();const calls=[];let metadata=0,launches=0,registrations=0;
 const key={toString:()=> 'test-wallet',toBase58:()=> 'test-wallet'};
 w.phantom={solana:{publicKey:key,connect:async opts=>{calls.push(opts);return connect?connect(opts):{publicKey:key};},on:(e,f)=>listeners.set(e,f),removeListener:(e,f)=>{if(listeners.get(e)===f)listeners.delete(e);}}};
 const row={kind:'image',body:'data:image/png;base64,AA==',who:'test-wallet',__txSignature:'2'.repeat(88)};
 w.iqCodein={hasOwnRpc:()=>false,estimateCost:()=>({chunks:1,total:1}),readBoard:async()=>({rows:boardRows}),readMine:async()=>({rows:[row]}),viewUrl:s=>'https://iqlabs.dev/?menu=codein&post='+s,metaUrl:s=>'https://gateway.iqlabs.dev/token-meta/'+s,connect:()=>({}),deriveBurner:async()=>({}),inscribeMeta:async()=>{metadata++;return {sig:'meta'};},inscribe:async()=>{registrations++;return {sig:'registry'};},notify:async()=>{},getSpeed:()=> 'light'};
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

test('linked coins reuse the chart action without wallet or transaction links',async t=>{
 const src='2'.repeat(88);
 const row={kind:'token',body:JSON.stringify({mint:'3'.repeat(44),name:'<b>Example</b>',symbol:'DEMO',src})};
 const v=await mount(t,undefined,[row,row]);
 v.w.iqCodein.readOne=async()=>({kind:'text',body:'original',who:'test-wallet'});
 v.w.$.code_in_v2.init(src);await tick();await tick();
 const box=v.w.$('#ci2_view_coins');assert.match(box.text(),/1 linked coin/);assert.equal(box.find('a,b').length,0);
 box.find('button').trigger('click');assert.equal(v.w.$('#ci2_chart_modal').hasClass('hide'),false);
 assert.deepEqual(v.counts(),{metadata:0,launches:0,registrations:0});
});

for (const outcome of ['ok', 'unavailable', 'throws']) test(`confirmed registration survives notify ${outcome} without another write or board scan`, async t => {
 const v = await mount(t), $ = v.w.$;
 let reads = 0, notifications = 0;
 v.w.iqCodein.readBoard = async () => { reads++; return {rows: []}; };
 v.w.iqCodein.notify = async () => {
  notifications++;
  if (outcome === 'throws') throw Error('gateway unavailable');
  return outcome === 'ok';
 };
 $('#ci2_mk_launch').trigger('click'); await tick();
 $('#ci2_tk_inv .rec').first().trigger('click'); $('#ci2_tk_continue').trigger('click');
 $('#ci2_tk_name').val('Test'); $('#ci2_tk_symbol').val('TEST'); $('#ci2_tk_go').trigger('click');
 await tick(); await tick();
 $('#ci2_tk_reg_retry').trigger('click'); await tick(); await tick();
 assert.equal(v.counts().registrations, 1);
 assert.equal(notifications, 1);
 assert.equal(reads, 0);
 assert.match($('#ci2_tk_regnote').text(), /registered on chain/);
 assert.match($('#ci2_tk_coins').text(), /1 linked coin/);
 assert.equal($('#ci2_tk_reg_retry').hasClass('hide'), true);
 $('#ci2_tk_reg_retry').trigger('click'); await tick();
 assert.equal(v.counts().registrations, 1);
 assert.equal(notifications, 1);
});

test('confirmed post remains visible with a stale gateway and rejected notification',async t=>{
 const v=await mount(t),$=v.w.$;
 v.w.iqCodein.notify=async()=>{throw Error('gateway offline');};
 $('#ci2_new').trigger('click');$('#ci2_text').val('confirmed post');$('#ci2_go').trigger('click');
 await tick();await tick();
 assert.equal(v.counts().registrations,1);
 assert.match($('#ci2_donenote').text(),/Confirmed on chain/);
 $('#ci2_view').trigger('click');await tick();
 assert.match($('#ci2_grid').text(),/confirmed post/);
 assert.equal(v.counts().registrations,1);
});
