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

  const result=JSON.parse(fs.readFileSync(path.join(out,'browser-result.json'),'utf8'));
  await page.locator('[name=img]:visible').fill(result.share);
  await page.locator('audio').waitFor();
  await page.waitForFunction(()=>{const a=document.querySelector('audio');return a&&a.readyState>=1&&!a.error;});
  const playback=await page.locator('audio').evaluate(async a=>{await a.play();await new Promise(r=>a.addEventListener('ended',r,{once:true}));return {duration:a.duration,ended:a.ended,error:a.error};});
  assert.equal(playback.ended,true);assert.equal(playback.error,null);assert.equal(playback.duration,0.25);
  await page.screenshot({path:path.join(out,'production-build-manual-attachment.png'),fullPage:true});
  fs.writeFileSync(path.join(out,'production-smoke.json'),JSON.stringify({url:page.url(),playback,errors},null,2));
  assert.deepEqual(errors,[]);console.log('Production build: manual attachment and actual audio playback passed');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
