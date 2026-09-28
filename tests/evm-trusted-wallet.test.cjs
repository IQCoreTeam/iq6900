const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
for(const [accounts,chain,expected] of [[[],'0x1237',null],[['0xabc'],'0x1',null],[['0xabc'],'0x1237','0xabc']]){
 test(`trusted EVM restore: accounts=${accounts.length}, chain=${chain}`,async()=>{
  const calls=[];
  const window=Object.assign(new EventTarget(),{ethereum:{request:async({method})=>{calls.push(method);if(method==='eth_accounts')return accounts;if(method==='eth_chainId')return chain;throw Error('Interactive request forbidden: '+method);}}});
  const context=vm.createContext({window,localStorage:{getItem:()=>null},console,setTimeout,clearTimeout,AbortController,Event,TextEncoder});
  const mod=new vm.SourceTextModule(fs.readFileSync('assets/js/codein/evm.js','utf8'),{context});
  await mod.link(name=>{
   const values=name.includes('ascii.js')?{toAscii:()=>''}:name.includes('ethers@')?{BrowserProvider:class{async getSigner(){return {address:accounts[0]};}},JsonRpcProvider:class{},formatEther:()=> '0'}:{setNetwork(){},utils:{getBasicFee:async()=>0n,getLinkedListFee:async()=>0n}};
   return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v);},{context});
  });
  await mod.evaluate();assert.equal(await window.iqCodeinChains.evm.connectWallet({onlyIfTrusted:true}),expected);
  assert.ok(calls.every(x=>['eth_accounts','eth_chainId'].includes(x)));
 });
}

async function setupWallets(balance = 0n) {
 const calls=[], writes=[];
 const window=new EventTarget();
 const phantom={request:async ({method})=>{calls.push(['phantom',method]);throw Error('Wrong wallet');}};
 const metamask={request:async({method})=>{
  calls.push(['metamask',method]);
  if(method==='eth_accounts'||method==='eth_requestAccounts')return ['0xabc'];
  if(method==='eth_chainId')return '0x1237';
  if(method==='eth_blockNumber')return '0x100';
  if(method==='wallet_switchEthereumChain')return null;
  throw Error(method);
 }};
 window.ethereum=phantom;
 const store=new Map();
 const context=vm.createContext({window,localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},console,setTimeout,clearTimeout,AbortController,Event,TextEncoder});
 const mod=new vm.SourceTextModule(fs.readFileSync('assets/js/codein/evm.js','utf8'),{context});
 await mod.link(name=>{
  const values=name.includes('ascii.js')?{toAscii:()=>''}:name.includes('ethers@')?{
   BrowserProvider:class {constructor(p){assert.equal(p,metamask);} async getSigner(){return {address:'0xabc'};} async getBalance(){return balance;}},
   JsonRpcProvider:class {async getBlockNumber(){return 256;}},formatEther:n=>String(Number(n)/1e18)
  }:{setNetwork(){},utils:{getBasicFee:async()=>120000000000000n,getLinkedListFee:async()=>360000000000000n},writer:{writeRow:async(...args)=>{writes.push(args);return '0xtx';}}};
  return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v);},{context});
 });
 await mod.evaluate();
 for(const [id,p] of [['app.phantom',phantom],['io.metamask',metamask]]){
  const event=new Event('eip6963:announceProvider');event.detail={info:{rdns:id,name:id==='io.metamask'?'MetaMask':'Phantom'},provider:p};window.dispatchEvent(event);
 }
 return {surface:window.iqCodeinChains.evm,calls,writes,metamask};
}
test('selecting MetaMask ignores Phantom global for connection and health check',async()=>{
 const {surface,calls,metamask}=await setupWallets();
 assert.equal(surface.getWallets().length,2);
 assert.equal(await surface.connectWallet({onlyIfTrusted:true}),null);
 assert.equal(calls.length,0);
 await surface.connectWallet({walletId:'io.metamask'});
 assert.equal(surface.getWalletProvider(),metamask);
 assert.equal((await surface.checkWalletRpc()).ok,true);
 assert.ok(calls.every(([wallet])=>wallet==='metamask'));
});
test('zero native balance blocks SDK write before any signature',async()=>{
 const {surface,calls,writes}=await setupWallets();await surface.connectWallet({walletId:'io.metamask'});
 calls.length=0;
 await assert.rejects(surface.inscribe({kind:'text',body:'test',who:'0xabc'}),{code:'INSUFFICIENT_FUNDS'});
 assert.equal(writes.length,0);
 assert.ok(calls.every(([,method])=>['eth_accounts','eth_chainId'].includes(method)));
});
test('funded selected account reaches SDK, stale displayed account does not',async()=>{
 const {surface,writes}=await setupWallets(1000000000000000000n);await surface.connectWallet({walletId:'io.metamask'});
 await assert.rejects(surface.inscribe({kind:'text',body:'test',who:'0xdef'}),/account or network changed/);
 assert.equal(writes.length,0);
 assert.equal((await surface.inscribe({kind:'text',body:'test',who:'0xabc'})).sig,'0xtx');
 assert.equal(writes.length,1);
});
