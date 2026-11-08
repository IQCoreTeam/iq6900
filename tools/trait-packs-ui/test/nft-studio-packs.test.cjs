const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
const deps=process.env.IQ_STUDIO_TEST_DEPS?createRequire(path.join(process.env.IQ_STUDIO_TEST_DEPS,'package.json')):require;
const {JSDOM}=deps('jsdom'),jquery=deps('jquery');
function setup(t,full=false){
 const dom=new JSDOM(full?fs.readFileSync(path.join(__dirname,'../../../assets/html/sections/nft_studio.html'),'utf8'):'<div id="nfts_status" class="err">old</div><div id="nfts_rescol"></div><div id="nfts_reslinks"></div><div id="nfts_result"></div>',{runScripts:'outside-only'});t.after(()=>dom.window.close());
 const w=dom.window;w.$=w.jQuery=jquery(w);w.eval(fs.readFileSync(path.join(__dirname,'../../../assets/js/sections/pages/nft_studio.js'),'utf8'));
 const studio=w.$.nft_studio;studio.dbg=studio.setBar=()=>{};if(!full)studio.renderSummary=studio.err=()=>{};studio.state={items:[{name:'Selected image'}]};studio.specFromState=()=>({slug:'test',name:'Test',symbol:'T',price:0,deposit:0,royaltyBps:0});
 return {w,studio};
}
test('packs off preserves the original deploy payload and selected items',async t=>{
 const {w,studio}=setup(t),items=studio.state.items;let payload;
 studio.packDraft={enabled:false,normal:{collection:'old'}};
 w.iqNft={deploy:async value=>{payload=value;return{slug:'test',collection:'base',deploySig:'receipt'};},solscanTx:()=>'/receipt'};
 await studio.deploy();assert.equal(payload.items,items);assert.equal(Object.hasOwn(payload,'packDraftId'),false);assert.equal(studio.state.deployed,true);
});
test('actual studio navigation resumes confirmed items without regenerating and keeps validation gates',async t=>{
 for(const mode of ['restored','standard','unvalidated'])await t.test(mode,t=>{
  const {w,studio}=setup(t,true);let generated=0,deployed=0;
  studio.state={step:3,itemsMode:'gen',items:[],name:'Recovered',symbol:'R',connected:null};studio.slugOk=true;
  studio.packDraft={enabled:mode!=='standard',normal:{collection:'confirmed-collection',itemCount:1},published:null,blockingReason:()=>mode==='unvalidated'?'Check the kit before publishing.':null};
  w.$('#nfts_pack_on').prop('checked',mode!=='standard');studio.generate=()=>{generated++;};w.iqNft={connected:()=>null,deploy:()=>{deployed++;throw Error('Navigation must not deploy');}};
  studio.wire();studio.updateNext();assert.equal(w.$('#nfts_next').text(),mode==='standard'?'make items':'continue →');assert.equal(w.$('#nfts_regen').css('display'),'none');
  w.$('#nfts_next').trigger('click');assert.equal(generated,mode==='standard'?1:0);assert.equal(deployed,0);assert.deepEqual(studio.state.items,[]);
  assert.equal(studio.state.step,mode==='restored'?4:3);
  if(mode==='restored'){assert.equal(w.$('#nfts_deploy').text(),'RETRY PACK SETUP');assert.equal(w.$('#nfts_sum_items').text(),'1');}
  if(mode==='unvalidated')assert.match(w.$('#nfts_error').text(),/Check the kit/);
 });
});
test('pack failure keeps the deployed collection and retry does not deploy it again',async t=>{
 const {w,studio}=setup(t);let deploys=0,publishes=0,received;const progress=[];
 studio.packDraft={enabled:true,draftId:'checked-kit',normal:null,blockingReason:()=>null,rememberCollection(result){this.normal=result;},async publish({onProgress}){publishes++;onProgress('Inscribing hair.png · 47%');progress.push(w.$('#nfts_status').text());if(publishes===1)throw Error('temporary pack outage');return{pool:'actual-pool'};}};
 w.iqNft={deploy:async payload=>{deploys++;received=payload;return{slug:'test',collection:'base',registry:'registry',deploySig:'receipt',itemCount:1};},solscanTx:()=>'/receipt'};
 await studio.deploy();assert.equal(studio.state.deployed,true);assert.match(w.$('#nfts_status').text(),/Collection deployed; retry only pack setup/);assert.equal(received.packDraftId,'checked-kit');
 studio.state.items=null; // A reload loses in-memory image objects, not the confirmed collection.
 await studio.deploy();assert.equal(deploys,1);assert.equal(publishes,2);assert.equal(studio.packDraft.normal.collection,'base');assert.match(w.$('#nfts_status').text(),/collection and pack setup confirmed/);assert.deepEqual(progress,['Inscribing hair.png · 47%','Inscribing hair.png · 47%']);
});
test('unvalidated enabled kit fails before collection deployment',async t=>{
 const {w,studio}=setup(t);let calls=0;studio.packDraft={enabled:true,blockingReason:()=> 'Check a trait kit before publishing.'};w.iqNft={deploy:async()=>{calls++;}};
 await studio.deploy();assert.equal(calls,0);assert.match(w.$('#nfts_status').text(),/Check a trait kit/);assert.equal(studio.state.deploying,false);
});

test('pack entry appears only after confirmed optional setup',t=>{
 const {w,studio}=setup(t);w.iqNft={solscanTx:()=>'/receipt'};
 const result={slug:'test',collection:'actual-collection'};
 studio.packDraft={enabled:true,published:null};studio.showResult(result);assert.equal(w.$('a').filter((_,a)=>a.textContent==='open trait packs →').length,0);
 studio.packDraft.published={pool:'confirmed-pool'};studio.showResult(result);assert.equal(w.$('a').filter((_,a)=>a.textContent==='open trait packs →').attr('href'),'?menu=packs&collection=actual-collection');
 studio.packDraft.enabled=false;studio.showResult(result);assert.equal(w.$('a').filter((_,a)=>a.textContent==='open trait packs →').length,0);
});

test('saved pack recovery may reuse only the matching collection handle',async t=>{
 const {w,studio}=setup(t);studio.state.slug='saved';
 studio.packDraft={enabled:true,normal:{collection:'own-collection',registry:'own-registry'},setSlug(){}};
 w.iqNft={getCollections:async()=>[{slug:'saved',coreCollection:'own-collection',registry:'own-registry'}]};
 await studio.refreshSlug();assert.equal(studio.slugOk,true);
 studio.packDraft.normal.collection='other-collection';await studio.refreshSlug();assert.equal(studio.slugOk,false);
 studio.packDraft.normal.collection='own-collection';studio.packDraft.normal.registry='other-registry';await studio.refreshSlug();assert.equal(studio.slugOk,false);
 studio.packDraft.enabled=false;await studio.refreshSlug();assert.equal(studio.slugOk,false);
});
