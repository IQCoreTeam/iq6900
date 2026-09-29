import path from 'node:path';
const root='/mnt/c/Users/Untra/Git/iqlabs/iq-local-review-evidence/sep23';
const iq='/home/linbox/.local/state/iq-local-review/iq6900-sep23';
const sdkPath='/home/linbox/.local/state/iq-book-rehearsal/sdk036-review';
const gateway='/home/linbox/.local/state/iq-local-review/gateway-media-sep23';
const RPC='https://api.devnet.solana.com';
for(const key of ['SOLANA_RPC_ENDPOINT','FRESH_RPC_URL','RECENT_RPC_URL','HELIUS_RPC_URL','ZEROBLOCK_RPC_URL'])process.env[key]='http://127.0.0.1:3221/rpc';
process.env.HELIUS_API_KEY='';process.env.HELIUS_API_KEYS='';
process.env.CACHE_DIR='/home/linbox/.local/state/iq-local-review/devnet-attachment/sep23-gateway-cache';
const sdk=await import(sdkPath+'/dist/index.js');sdk.setRpcUrl('http://127.0.0.1:3221/rpc');
const {Connection}=await import(sdkPath+'/node_modules/@solana/web3.js/lib/index.cjs.js');
const connection=new Connection(RPC,'confirmed');
const genesis=await connection.getGenesisHash();
if(genesis!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw Error('Not public devnet');
const {Hono}=await import(gateway+'/node_modules/hono/dist/index.js');
const {mediaRouter}=await import(gateway+'/src/routes/media.ts');
const {readSingleRow}=await import(gateway+'/src/chain/solana/reader.ts');
const {tableRouter}=await import(gateway+'/src/routes/table.ts');
const {metaRouter}=await import(gateway+'/src/routes/meta.ts');
const {dataRouter}=await import(gateway+'/src/routes/data.ts');
const {userRouter}=await import(gateway+'/src/routes/user.ts');
const app=new Hono();
app.use('*',async(c,next)=>{c.set('chain',{kind:'solana',network:'solana',readSingleRow});await next();});
app.route('/media',mediaRouter);
app.route('/table',tableRouter);app.route('/meta',metaRouter);app.route('/data',dataRouter);app.route('/user',userRouter);
const signatures:string[]=[];
const methods:Record<string,number>={};
let rpcQueue=Promise.resolve();
async function staticFile(base:string,file:string){const p=path.resolve(base,file);if(!p.startsWith(base+'/'))return new Response(null,{status:403});return new Response(Bun.file(p));}
for(const port of [3222,3221])Bun.serve({hostname:'127.0.0.1',port,idleTimeout:120,async fetch(req){
 async function handle(req){
 const url=new URL(req.url),p=url.pathname;
 if(!['localhost:'+port,'127.0.0.1:'+port].includes(req.headers.get('host')||''))return new Response(null,{status:403});
 if(p==='/rpc'){
  if(req.method!=='POST'||(req.headers.get('origin')&&!['http://localhost:3220',url.origin].includes(req.headers.get('origin'))))return new Response(null,{status:403});
  const body=await req.json();
  if(body.method==='sendTransaction'&&!['http://localhost:3220',url.origin].includes(req.headers.get('origin')||''))return new Response(null,{status:403});
  if(!/^get[A-Z]|^sendTransaction$|^isBlockhashValid$/.test(body.method||''))return new Response('Method not allowed',{status:403});
  methods[body.method]=(methods[body.method]||0)+1;
  const previous=rpcQueue;let release;rpcQueue=new Promise(resolve=>{release=resolve});
  await previous;await Bun.sleep(500);
  let upstream;
  try{upstream=await fetch(RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}finally{release();}
  const data=await upstream.text();
  if(body.method==='sendTransaction'){const parsed=JSON.parse(data);if(parsed.result){signatures.push(parsed.result);await Bun.write(root+'/devnet-evidence/submissions.json',JSON.stringify(signatures,null,2));console.log('Devnet submitted',parsed.result);}else console.log('Devnet submission error',JSON.stringify(parsed.error));}
  return new Response(data,{status:upstream.status,headers:{'Content-Type':'application/json'}});
 }
 if(p==='/evidence')return Response.json({genesis,signatures,methods});
 if(/^\/(media|table|meta|data|user)\//.test(p))return app.fetch(req);
 if(p==='/parent.js'||p==='/uploader.js')return staticFile(root+'/devnet-preview',p.slice(1));
 if(p==='/jquery.js')return staticFile(iq+'/tests/node_modules/jquery/dist','jquery.js');
 if(p==='/code_in_v2.js'||p==='/js/sections/pages/code_in_v2.js'){
  // Devnet build-time network selection; do not pretend devnet records are mainnet.
  const source=(await Bun.file(iq+'/assets/js/sections/pages/code_in_v2.js').text()).replace('window.iqCodein.cluster !== "mainnet-beta"','window.iqCodein.cluster !== "devnet"');
  return new Response(source,{headers:{'Content-Type':'text/javascript'}});
 }
 if(p.startsWith('/assets/'))return staticFile(iq+'/assets',p.slice(8));
 if(/^\/(css|fonts|img|html|js)\//.test(p))return staticFile(iq+'/assets',p.slice(1));
 if(p==='/'){
  if(port===3221){
   let html=await Bun.file(iq+'/assets/index.html').text();
   html=html.replace('https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js','/jquery.js')
    .replace('js/codein/browser.js?ver=23','/uploader.js')
    .replace('<title>IQLabs</title>','<title>IQ Labs · Devnet</title>')
    .replace('<div class="pc_menu">','<div class="pc_menu"><div style="text-align:center;padding:6px;font:12px monospace;color:#e8e4d6">DEVNET · Test SOL only</div>');
   return new Response(html,{headers:{'Content-Type':'text/html'}});
  }
  const start=`$.ajax=({success})=>fetch('/assets/html/sections/code_in_v2.html').then(r=>r.text()).then(success);window.startUploader=()=>$.code_in_v2.init(new URLSearchParams(location.search).get('post'));if(!navigator.webdriver){const t=setInterval(()=>{if(window.devnetReady){clearInterval(t);startUploader();}},50);}`;
  const html=port===3222?'<div id="root"></div><script type="module" src="/parent.js"></script>':'<h2>Public Solana devnet — test SOL only</h2><p id="wallet-mode">Real Code-In upload. Chrome uses your installed wallet; automated tests use a dedicated devnet keypair.</p><div id="main_section"></div><script src="/jquery.js"></script><script src="/code_in_v2.js"></script><script>'+start+'</script><script type="module" src="/uploader.js"></script>';
  return new Response('<!doctype html><meta charset="utf-8"><title>Real devnet attachment</title><style>body{font:15px system-ui;margin:24px}textarea{width:600px;height:100px}main{max-width:800px;margin:auto}</style>'+html,{headers:{'Content-Type':'text/html'}});
 }
 return new Response(null,{status:404});
 }
 const origin=req.headers.get('Origin');
 const allowed=['http://localhost:3220','http://localhost:3222','http://localhost:3221'].includes(origin||'');
 const res=req.method==='OPTIONS'?new Response(null,{status:204}):await handle(req);
 if(allowed){res.headers.set('Access-Control-Allow-Origin',origin);res.headers.set('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.headers.set('Access-Control-Allow-Headers','content-type,if-none-match,range,solana-client');res.headers.set('Access-Control-Expose-Headers','etag,content-range');res.headers.set('Vary','Origin');}
 return res;
}});
console.log('Real devnet attachment: http://localhost:3222/ ; uploader http://localhost:3221/');
