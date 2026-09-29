const {chromium}=require('C:/Users/Untra/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname,out=path.join(root,'sep23','devnet-evidence');
const secret=JSON.parse(fs.readFileSync('\\\\wsl.localhost\\Ubuntu\\home\\linbox\\.local\\state\\iq-local-review\\devnet-attachment\\wallet.json','utf8'));
const wav=fs.readFileSync(path.join(root,'devnet-evidence','devnet-tone.wav'));
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Users/Untra/AppData/Local/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-win64/chrome-headless-shell.exe'});
 const context=await browser.newContext({viewport:{width:1200,height:1000}});
 let popup,page;const errors=[],blocked=[];
 try{
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());
   if(['localhost','127.0.0.1'].includes(u.hostname))return route.continue();
   blocked.push(u.origin);return route.abort();
  });
  // A connection-only Wallet Standard adapter exposes the dedicated test account
  // to the actual posting app. Signing happens in the actual uploader below.
  await context.addInitScript(({pubkey})=>{
   if(location.port!=='3220')return;
   localStorage.setItem('blockchan_gateway','http://localhost:3221');
   localStorage.setItem('blockchan_fallbacks','[]');
   const account={address:'8kEJbuu74Ck9gccEz9vrZtncDbJZuHunEmDExMG2Fdwd',publicKey:new Uint8Array(pubkey),chains:['solana:devnet'],features:['solana:signTransaction']};
   let accounts=[];const listeners=new Set();
   const wallet={version:'1.0.0',name:'Dedicated devnet test wallet',icon:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',chains:['solana:devnet'],get accounts(){return accounts;},features:{
    'standard:events':{version:'1.0.0',on:(event,fn)=>{if(event==='change')listeners.add(fn);return()=>listeners.delete(fn);}},
    'standard:connect':{version:'1.0.0',connect:async()=>{accounts=[account];listeners.forEach(f=>f({accounts}));return {accounts};}},
    'standard:disconnect':{version:'1.0.0',disconnect:async()=>{accounts=[];listeners.forEach(f=>f({accounts}));}},
    'solana:signTransaction':{version:'1.0.0',supportedTransactionVersions:['legacy',0],signTransaction:async()=>{throw Error('Posting is outside this attachment test');}},
   }};
   const register=({register})=>register(wallet);
   window.addEventListener('wallet-standard:app-ready',e=>register(e.detail));
   window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet',{detail:register}));
  },{pubkey:secret.slice(32)});
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:3220/#/iq');
  await page.getByRole('button',{name:'Connect your wallet to post',exact:true}).click({timeout:60000});
  await page.getByRole('button',{name:/Dedicated devnet test wallet/}).click();
  await page.getByRole('link',{name:'Start a New Thread',exact:true}).click();
  await page.locator('[name=sub]:visible').fill('Devnet attachment integration — do not post');
  await page.locator('[name=com]:visible').fill('This draft stays here while a real devnet inscription is attached.');
  const next=page.waitForEvent('popup');await page.getByRole('button',{name:'Inscribe attachment',exact:true}).click();popup=await next;
  popup.on('pageerror',e=>errors.push(e.message));
  popup.on('console',m=>{if(m.type()==='error'&&!m.text().includes('ERR_FAILED'))console.log('UPLOADER',m.text().slice(0,400));});
  await popup.waitForFunction(()=>window.devnetReady,{},{timeout:60000});
  await popup.evaluate(key=>window.installDevnetTestSigner(key),secret);
  // Normal UI initialization may predate signer installation; initialize the
  // same page module again to discover the real signing provider.
  await popup.evaluate(()=>window.$.code_in_v2.init(null,'solana'));
  await popup.locator('#ci2_file_file').setInputFiles({name:'my track; #1 (live).wav',mimeType:'audio/wav',buffer:wav});
  await popup.locator('#ci2_go:not([disabled])').waitFor();
  await popup.screenshot({path:path.join(out,'before-upload.png'),fullPage:true});
  await popup.locator('#ci2_go').click();
  await Promise.race([
   page.getByText('Attachment added. Review your post, then press Post when ready.',{exact:true}).waitFor({timeout:240000}),
   popup.locator('#ci2_retry').waitFor({state:'visible',timeout:240000}).then(async()=>{throw Error(await popup.locator('#ci2_log').textContent())})
  ]);
  const share=await page.locator('[name=img]:visible').inputValue(),signature=new URL(share).searchParams.get('post');
  assert(signature);assert.equal(await page.locator('[name=com]:visible').inputValue(),'This draft stays here while a real devnet inscription is attached.');
  assert.equal(await popup.locator('#ci2_share_link').inputValue(),share);
  const response=await fetch('http://localhost:3221/media/'+signature+'?network=solana');
  assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),wav);
  await page.locator('audio').waitFor();
  await page.screenshot({path:path.join(out,'automatic-return-real-blockchan.png'),fullPage:true});
  await popup.screenshot({path:path.join(out,'confirmed-real-iq6900.png'),fullPage:true});
  await page.getByRole('button',{name:'[Remove]',exact:true}).click();
  await page.locator('[name=img]:visible').fill(share);await page.locator('audio').waitFor();
  await page.screenshot({path:path.join(out,'manual-link-real-blockchan.png'),fullPage:true});
  fs.writeFileSync(path.join(out,'browser-result.json'),JSON.stringify({scope:'Full BlockChan and full IQ6900 apps; actual devnet upload with dedicated test signer, connection-only Wallet Standard adapter in posting app. No Phantom extension approvals and no thread publication.',signature,share,mediaBytes:wav.length,filename:'my track; #1 (live).wav',exactMediaReadback:true,draftPreserved:true,manualLinkFallback:true,errors,blockedOrigins:[...new Set(blocked)],evidence:await(await fetch('http://localhost:3221/evidence')).json()},null,2));
  assert.deepEqual(errors,[]);
  console.log('SUCCESS',signature);
 }catch(e){
  if(page){await page.screenshot({path:path.join(out,'parent-failure.png'),fullPage:true});console.log((await page.locator('body').innerText()).slice(0,3500));}
  if(popup){await popup.screenshot({path:path.join(out,'uploader-failure.png'),fullPage:true});console.log((await popup.locator('body').innerText()).slice(0,2500));}
  throw e;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
