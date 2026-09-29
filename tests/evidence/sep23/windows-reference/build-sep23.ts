const root='/mnt/c/Users/Untra/Git/iqlabs/iq-local-review-evidence/sep23';
const iq='/home/linbox/.local/state/iq-local-review/iq6900-sep23';
const sdk='/home/linbox/.local/state/iq-book-rehearsal/sdk036-review';
const frontend='/home/linbox/.local/state/iq-book-rehearsal/frontend-home-review';
await Bun.write(root+'/devnet-preview/uploader.ts',`
import {Buffer} from '${sdk}/node_modules/buffer';
import {Keypair,Transaction,Connection} from '${sdk}/node_modules/@solana/web3.js/lib/index.browser.esm.js';
import {ed25519} from '${sdk}/node_modules/@noble/curves/ed25519.js';
window.Buffer=Buffer;
// Automation supplies a dedicated devnet-only key in memory. Normal Chrome uses
// the installed wallet extension; no key is served or stored by this page.
window.installDevnetTestSigner=(secret)=>{
 const key=Keypair.fromSecretKey(Uint8Array.from(secret));
 window.solana={publicKey:key.publicKey,connect:async()=>({publicKey:key.publicKey}),
 signMessage:async msg=>({signature:ed25519.sign(msg,key.secretKey.slice(0,32))}),
 signTransaction:async tx=>{
  const c=new Connection(location.origin+'/rpc','confirmed');
  if(await c.getGenesisHash()!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw Error('Wrong network');
  tx.partialSign(key);return tx;
 }};
};
await import('${iq}/assets/js/codein/browser.js');
window.devnetReady=true;
`);
const plugins=[{name:'devnet-settings',setup(build){
 build.onResolve({filter:/^@iqlabs-official\/solana-sdk$/},()=>({path:sdk+'/dist/index.js'}));
 build.onResolve({filter:/^@solana\/web3.js$/},()=>({path:sdk+'/node_modules/@solana/web3.js/lib/index.browser.esm.js'}));
 build.onResolve({filter:/\.js\?v=/},args=>({path:args.resolveDir+'/'+args.path.split('?')[0]}));
 build.onLoad({filter:/codein\/browser\.js$/},async args=>({loader:'js',contents:(await Bun.file(args.path).text())
  .replace('"https://solana-rpc.publicnode.com"','window.location.origin + "/rpc"')
  .replace('const CLUSTER = DEFAULT_RPC.indexOf("devnet") >= 0 ? "devnet" : "mainnet-beta";','const CLUSTER = "devnet";')
  .replace('const GATEWAYS = ["https://gateway.iqlabs.dev"];','const GATEWAYS = [window.location.origin];')
  .replace('new Connection(rpc || activeRpc, "confirmed")','new Connection(rpc || activeRpc, {commitment:"confirmed",wsEndpoint:"wss://api.devnet.solana.com"})')}));
}}];
const output=await Bun.build({entrypoints:[root+'/devnet-preview/uploader.ts'],outdir:root+'/devnet-preview',target:'browser',define:{'process.env':'{}'},plugins});
if(!output.success)throw Error(output.logs.join('\n'));
