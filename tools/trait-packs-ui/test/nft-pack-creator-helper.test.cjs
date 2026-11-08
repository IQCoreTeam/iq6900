if(!process.env.IQ_PACK_CLIENT_ROOT)throw Error('Set IQ_PACK_CLIENT_ROOT to the reviewed companion client checkout');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
const deps=process.env.IQ_STUDIO_TEST_DEPS?createRequire(path.join(process.env.IQ_STUDIO_TEST_DEPS,'package.json')):require;
const {JSDOM}=deps('jsdom');
async function until(predicate){for(let i=0;i<100;i++){if(predicate())return;await new Promise(setImmediate);}throw Error('Expected UI state did not arrive');}
test('kit upload reads only referenced images and keeps pixels lazy until deploy',async t=>{
 const html=fs.readFileSync(path.join(__dirname,'../../../assets/html/sections/nft_studio.html'),'utf8');
 const dom=new JSDOM(html,{url:'http://127.0.0.1:4554/?menu=nft-create'}),w=dom.window;w.iqNft={connected:()=>'11111111111111111111111111111111',authorizePackCreator:async()=>({Authorization:'Bearer test-session'})};
 const old={window:global.window,document:global.document,location:global.location,localStorage:global.localStorage,fetch:global.fetch};
 Object.assign(global,{window:w,document:w.document,location:w.location,localStorage:w.localStorage});t.after(()=>{Object.assign(global,old);dom.window.close();});
 const {createPackDraft}=await import('../../../assets/js/sections/pages/nft_pack_creator.js');
 const root=w.document.querySelector('#nfts'),model=createPackDraft(root,{onChange(){}});t.after(()=>model.dispose());model.setSlug('checked');
 assert.equal(model.enabled,false);
 w.document.querySelector('#nfts_pack_price').value='0.03';
 const on=w.document.querySelector('#nfts_pack_on');on.checked=true;on.dispatchEvent(new w.Event('change'));
 const manifest={schema:'iq-trait-kit/1',config:{groups:[{name:'Hair',assets:[{id:'hair',file:'hair.png',label:'Blue'}]}]},items:[{index:1,name:'Kit #1',file:'base.webp',sourceDna:['hair']}],appearance:{},definitions:[{id:0}]};
 const recipe=w.document.querySelector('#nfts_pack_manifest');Object.defineProperty(recipe,'files',{value:[{name:'kit.json',size:300,text:async()=>JSON.stringify(manifest)}]});recipe.dispatchEvent(new w.Event('change'));await until(()=>root.querySelector('#nfts_pack_status').textContent.includes('Recipe loaded'));
 let secretReads=0;
 const images=w.document.querySelector('#nfts_pack_files');Object.defineProperty(images,'files',{value:[{name:'hair.png',size:3,arrayBuffer:async()=>Uint8Array.from([1,2,3]).buffer},{name:'base.webp',size:3,arrayBuffer:async()=>Uint8Array.from([4,5,6]).buffer},{name:'private-key.json',size:100,arrayBuffer:async()=>{secretReads++;throw Error('must not read');}}]});images.dispatchEvent(new w.Event('change'));await until(()=>root.querySelector('#nfts_pack_filecount').textContent.includes('3 files'));
 w.iqNft={authorizePackCreator:async()=>({Authorization:'Bearer test-session'}),connected:()=>'11111111111111111111111111111111'};
 const payloads=[];
 global.fetch=async(url,options)=>{assert.equal(options.headers.Authorization,'Bearer test-session');assert.equal(options.redirect,'error');const body=JSON.parse(options.body);payloads.push(body);const result=body.final?{draftId:'checked-draft',summary:{itemCount:1,eligibleCount:1,definitionCount:1,packCount:1},cost:{localOnly:true,description:'Local test only.',catalogSetupSignatures:3}}:{draftId:'checked-draft',status:'uploading'};return{ok:true,json:async()=>result};};
 root.querySelector('#nfts_pack_validate').click();await until(()=>model.summary?.itemCount===1);
 assert.equal(payloads.every(body=>body.sourceConsent===false),true);assert.equal(secretReads,0);assert.deepEqual(payloads.flatMap(body=>(body.files||[]).map(file=>file.name)),['hair.png','base.webp']);assert.equal(model.draftId,'checked-draft');assert.match(model.blockingReason(),/source-layer notice/);
 const accept=root.querySelector('#nfts_pack_accept');accept.checked=true;accept.dispatchEvent(new w.Event('change'));
 const items=await model.collectionItems();assert.equal(items.length,1);assert.equal(typeof items[0].imageData,'function');assert.equal(items[0].template.attributes[0].value,'Blue');
 const saved=JSON.parse(w.localStorage.getItem('iqstudio:pack-recovery:checked'));assert.equal(saved.draftId,'checked-draft');assert.equal(JSON.stringify(saved).includes('base64'),false);assert.equal(JSON.stringify(saved).includes('private-key'),false);
});

test('pack prices preserve exact lamports and reject free, sub-lamport, exponential and unsafe values',async()=>{
 const {parsePackPrice}=await import('../../../assets/js/sections/pages/nft_pack_creator.js');
 assert.equal(parsePackPrice('0.03'),30000000);assert.equal(parsePackPrice('.03'),30000000);assert.equal(parsePackPrice('000.03'),30000000);assert.equal(parsePackPrice('1.'),1000000000);assert.equal(parsePackPrice('0.000000001'),1);assert.equal(parsePackPrice('1.123456789'),1123456789);
 for(const value of ['0','0.000000000','-1','1e3','0.0000000001','9007199.254740992','1.2.3',''])assert.throws(()=>parsePackPrice(value));
});

test('restored changed kits are rejected before a new explicit review; local edits reset identity',async t=>{
 const {createPackDraft}=await import('../../../assets/js/sections/pages/nft_pack_creator.js');
 for(const kind of ['recipe','file'])await t.test(kind,async t=>{
  const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../../../assets/html/sections/nft_studio.html'),'utf8'),{url:'http://127.0.0.1:4558/?menu=nft-create'}),w=dom.window;w.iqNft={connected:()=>'11111111111111111111111111111111',authorizePackCreator:async()=>({Authorization:'Bearer test-session'})};
  const old={window:global.window,document:global.document,location:global.location,localStorage:global.localStorage,fetch:global.fetch};Object.assign(global,{window:w,document:w.document,location:w.location,localStorage:w.localStorage});t.after(()=>{Object.assign(global,old);w.close();});
  w.localStorage.setItem('iqstudio:pack-recovery:changed',JSON.stringify({enabled:true,draftId:'older-draft',summary:{itemCount:1},priceSol:'0.03'}));
  const root=w.document.querySelector('#nfts'),model=createPackDraft(root,{onChange(){}});t.after(()=>model.dispose());model.setSlug('changed');
  let manifest={schema:'iq-trait-kit/1',config:{groups:[{assets:[{file:'hair.png'}]}]},items:[{file:'base.webp'}]};
  const recipe=root.querySelector('#nfts_pack_manifest');Object.defineProperty(recipe,'files',{value:[{size:1000,text:async()=>JSON.stringify(manifest)}]});
  recipe.dispatchEvent(new w.Event('change'));await until(()=>root.querySelector('#nfts_pack_status').textContent.includes('Recipe loaded'));assert.equal(model.draftId,'older-draft');
  const images=root.querySelector('#nfts_pack_files');Object.defineProperty(images,'files',{value:['hair.png','base.webp'].map(name=>({name,size:1,arrayBuffer:async()=>new Uint8Array([1])}))});images.dispatchEvent(new w.Event('change'));await until(()=>root.querySelector('#nfts_pack_filecount').textContent.includes('2 files'));
  const calls=[];let created=0;
  global.fetch=async(_url,options)=>{
   const body=JSON.parse(options.body);calls.push(body);
   if(body.draftId==='older-draft'&&((kind==='recipe'&&body.manifest)||(kind==='file'&&body.files.length)))return{ok:false,status:409,json:async()=>({error:kind==='recipe'?'Start a new draft after changing its kit or price':'An uploaded source image changed'})};
   const id=body.draftId??'review-'+(++created);return{ok:true,json:async()=>body.final?{draftId:id,summary:{itemCount:1},cost:{}}:{draftId:id}};
  };
  root.querySelector('#nfts_pack_validate').click();await until(()=>model.draftId===null&&root.querySelector('#nfts_pack_status').classList.contains('err'));
  const rejectedCalls=calls.length;await new Promise(setImmediate);assert.equal(calls.length,rejectedCalls);assert.equal(created,0);assert.match(root.querySelector('#nfts_pack_status').textContent,/Check again.*Previous publication receipts remain saved/);
  root.querySelector('#nfts_pack_validate').click();await until(()=>model.summary?.itemCount===1);assert.equal(created,1);assert.equal(model.draftId,'review-1');assert.equal(calls[rejectedCalls].draftId,undefined);
  manifest={...manifest,config:{...manifest.config,name:'Intentional recipe change'}};recipe.dispatchEvent(new w.Event('change'));await until(()=>model.draftId===null);root.querySelector('#nfts_pack_validate').click();await until(()=>model.summary?.itemCount===1);assert.equal(model.draftId,'review-2');
  root.querySelector('#nfts_pack_price').value='0.04';root.querySelector('#nfts_pack_price').dispatchEvent(new w.Event('input'));assert.equal(model.draftId,null);assert.equal(model.summary,null);assert.equal(root.querySelector('#nfts_pack_accept').checked,false);
  root.querySelector('#nfts_pack_validate').click();await until(()=>model.summary?.itemCount===1);assert.equal(model.draftId,'review-3');recipe.files[0].text=async()=>'{';recipe.dispatchEvent(new w.Event('change'));await until(()=>model.draftId===null);assert.equal(model.summary,null);
 });
});

test('completed pack setup survives reload without demanding disabled consent or republishing',async t=>{
 const html=fs.readFileSync(path.join(__dirname,'../../../assets/html/sections/nft_studio.html'),'utf8');
 const dom=new JSDOM(html,{url:'http://127.0.0.1:4558/?menu=nft-create'}),w=dom.window;w.iqNft={connected:()=>'11111111111111111111111111111111',authorizePackCreator:async()=>({Authorization:'Bearer test-session'})};
 const old={window:global.window,document:global.document,location:global.location,localStorage:global.localStorage,fetch:global.fetch};
 Object.assign(global,{window:w,document:w.document,location:w.location,localStorage:w.localStorage});
 t.after(()=>{Object.assign(global,old);w.close();});
 const published={pool:'confirmed-pool',renderKit:'confirmed-render-kit'};
 w.localStorage.setItem('iqstudio:pack-recovery:complete',JSON.stringify({enabled:true,draftId:'checked',summary:{itemCount:1},normal:{collection:'confirmed-collection'},published,priceSol:'0.03'}));
 global.fetch=async()=>{throw Error('Completed setup must not be sent again');};
 const {createPackDraft}=await import('../../../assets/js/sections/pages/nft_pack_creator.js');
 const model=createPackDraft(w.document.querySelector('#nfts'),{onChange(){}});t.after(()=>model.dispose());model.setSlug('complete');
 assert.equal(w.document.querySelector('#nfts_pack_accept').disabled,true);
 assert.equal(w.document.querySelector('#nfts_pack_accept').checked,false);
 assert.equal(model.blockingReason(),null);
 assert.deepEqual(await model.publish(),published);
});

test('funding refund failure preserves confirmed setup and retries after reload without republishing',async t=>{
 const {pathToFileURL}=require('node:url'),os=require('node:os');
 const production=process.env.IQ_PACK_CLIENT_ROOT;
 const {fixture}=await import(pathToFileURL(path.join(production,'../creator/test/fixtures.mjs')).href),{prepareRenderKit}=await import(pathToFileURL(path.join(production,'../creator/kit.mjs')).href);
 const source=await fixture();source.input.appearance.coverFile=null;t.after(()=>source.stop());const kit=await prepareRenderKit(source.input,source.root);
 const html=fs.readFileSync(path.join(__dirname,'../../../assets/html/sections/nft_studio.html'),'utf8'),dom=new JSDOM(html,{url:'http://127.0.0.1:4558/?menu=nft-create'}),w=dom.window;w.iqNft={connected:()=>'11111111111111111111111111111111',authorizePackCreator:async()=>({Authorization:'Bearer test-session'})};
 const old={window:global.window,document:global.document,location:global.location,localStorage:global.localStorage,fetch:global.fetch};Object.assign(global,{window:w,document:w.document,location:w.location,localStorage:w.localStorage});t.after(()=>{Object.assign(global,old);w.close();});
 const progress=[],checkpointKey=id=>'iq-pack-publication:solana:localnet:creator:'+('3'.repeat(32))+':'+id;
 const confirmedCheckpoint={artifacts:{'image:hair-a.png':{signature:'2'.repeat(88),sha256:'ab'.repeat(32)}}};w.localStorage.setItem(checkpointKey('checked'),JSON.stringify(confirmedCheckpoint));
 let media=0,mediaWrites=0,setup=0,sweeps=0;w.iqNft={authorizePackCreator:async()=>({Authorization:'Bearer test-session'}),connected:()=>'11111111111111111111111111111111',localOnly:true,publishPackMedia:async({onProgress,draftId})=>{media++;onProgress({file:'layers/hair.png',percent:47});onProgress({phase:'checking-gateway-copy'});const saved=w.localStorage.getItem(checkpointKey(draftId));if(!saved)mediaWrites++;return saved?JSON.parse(saved):{artifacts:{}};},publishPackSetup:async()=>{setup++;},sweepPackFunding:async()=>{sweeps++;if(sweeps===1)throw Error('Temporary refund RPC outage');}};
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'iq-refund-helper-'));t.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
 const helper=fs.readFileSync(path.join(__dirname,'../../../assets/js/sections/pages/nft_pack_creator.js'),'utf8').replace('import(moduleURL.href)',`import(${JSON.stringify(pathToFileURL(path.join(production,'kit-review.mjs')).href)})`);fs.writeFileSync(path.join(temporary,'helper.mjs'),helper);
 const {createPackDraft}=await import(pathToFileURL(path.join(temporary,'helper.mjs')).href),root=w.document.querySelector('#nfts');let model=createPackDraft(root,{onChange(){}});model.setSlug('refund-recovery');
 root.querySelector('#nfts_pack_on').checked=true;root.querySelector('#nfts_pack_on').dispatchEvent(new w.Event('change'));
 const recipe=root.querySelector('#nfts_pack_manifest');Object.defineProperty(recipe,'files',{value:[{name:'kit.json',size:1000,text:async()=>JSON.stringify(source.input)}]});recipe.dispatchEvent(new w.Event('change'));await until(()=>root.querySelector('#nfts_pack_status').textContent.includes('Recipe loaded'));
 const images=root.querySelector('#nfts_pack_files'),selected=await Promise.all(kit.files.map(async entry=>{const bytes=fs.readFileSync(path.join(source.root,entry.file));return{name:entry.file,size:bytes.length,arrayBuffer:async()=>bytes};}));
 Object.defineProperty(images,'files',{value:selected});images.dispatchEvent(new w.Event('change'));await until(()=>root.querySelector('#nfts_pack_filecount').textContent.includes('5 files'));
 const result={pool:'1'.repeat(32),renderKit:'2'.repeat(88)},calls=[];let draftCreated=false;
 global.fetch=async(url,options)=>{calls.push(String(url));const body=JSON.parse(options.body);let value;if(String(url).endsWith('/validate')){const id=body.draftId??(draftCreated?'unexpected-new-draft':'checked');if(body.manifest)draftCreated=true;value=body.final?{draftId:id,summary:{itemCount:1},cost:{mediaFundingLamports:1000000,operationsReserveLamports:148000000},publicationKit:kit}:{draftId:id};}else if(String(url).endsWith('/publish'))value={stage:'setup'};else if(String(url).endsWith('/finalize'))value=result;else throw Error('Unexpected publication request');return{ok:true,json:async()=>value};};
 root.querySelector('#nfts_pack_validate').click();await until(()=>model.summary?.itemCount===1);root.querySelector('#nfts_pack_accept').checked=true;
 model.rememberCollection({slug:'refund-recovery',collection:'3'.repeat(32),registry:'4'.repeat(32),itemCount:1},{name:'Refund recovery',slug:'refund-recovery'});
 // A reload loses Files, not the old draft or confirmed publication namespace.
 model.dispose();model=createPackDraft(root,{onChange(){}});model.setSlug('refund-recovery');assert.equal(model.draftId,'checked');
 recipe.dispatchEvent(new w.Event('change'));await until(()=>root.querySelector('#nfts_pack_status').textContent.includes('Recipe loaded'));
 images.dispatchEvent(new w.Event('change'));await until(()=>root.querySelector('#nfts_pack_filecount').textContent.includes('5 files'));assert.equal(model.draftId,'checked');
 root.querySelector('#nfts_pack_validate').click();await until(()=>model.summary?.itemCount===1);assert.equal(model.draftId,'checked');root.querySelector('#nfts_pack_accept').checked=true;
 assert.deepEqual(await model.publish({onProgress:text=>{progress.push({text,display:root.querySelector('#nfts_pack_status').textContent});if(text.includes('47%'))throw Error('Broken progress display');if(text==='Confirming pack setup…')return Promise.reject(Error('Async progress display failed'));}}),result);assert.equal(model.published.pool,result.pool);assert.equal(media,1);assert.equal(setup,1);assert.equal(sweeps,1);
 assert.deepEqual(progress.find(event=>event.text.includes('47%')),{text:'Inscribing layers/hair.png · 47%',display:'Inscribing layers/hair.png · 47%'});
 assert.equal(progress.some(event=>event.text.startsWith('Checking the gateway copy')),true);assert.equal(mediaWrites,0);assert.deepEqual(JSON.parse(w.localStorage.getItem(checkpointKey('checked'))),confirmedCheckpoint);
 let saved=JSON.parse(w.localStorage.getItem('iqstudio:pack-recovery:refund-recovery'));assert.equal(saved.fundingRefundPending,true);assert.deepEqual(saved.published,result);
 assert.equal(root.querySelector('#nfts_pack_refund_notice').hidden,false);assert.equal(root.querySelector('#nfts_pack_refund_retry').disabled,false);assert.equal(root.querySelector('#nfts_pack_status').classList.contains('err'),false);
 const requests=calls.length;model.dispose();model=createPackDraft(root,{onChange(){}});t.after(()=>model.dispose());model.setSlug('refund-recovery');
 assert.equal(root.querySelector('#nfts_pack_refund_notice').hidden,false);assert.deepEqual(await model.publish(),result);assert.equal(calls.length,requests);assert.equal(sweeps,1);
 global.fetch=async()=>{throw Error('Refund recovery must not publish or deploy again');};root.querySelector('#nfts_pack_refund_retry').click();await until(()=>root.querySelector('#nfts_pack_refund_notice').hidden);
 saved=JSON.parse(w.localStorage.getItem('iqstudio:pack-recovery:refund-recovery'));assert.equal(saved.fundingRefundPending,false);assert.deepEqual(saved.published,result);assert.equal(sweeps,2);assert.equal(media,1);assert.equal(setup,1);assert.equal(calls.length,requests);
});
