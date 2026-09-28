const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
for(const [accounts,chain,expected] of [[[],'0x1237',null],[['0xabc'],'0x1',null],[['0xabc'],'0x1237','0xabc']]){
 test(`trusted EVM restore: accounts=${accounts.length}, chain=${chain}`,async()=>{
  const calls=[];
  const window={ethereum:{request:async({method})=>{calls.push(method);if(method==='eth_accounts')return accounts;if(method==='eth_chainId')return chain;throw Error('Interactive request forbidden: '+method);}}};
  const context=vm.createContext({window,localStorage:{getItem:()=>null},console,setTimeout,clearTimeout,AbortController});
  const mod=new vm.SourceTextModule(fs.readFileSync('assets/js/codein/evm.js','utf8'),{context});
  await mod.link(name=>{
   const values=name.includes('ascii.js')?{toAscii:()=>''}:name.includes('ethers@')?{BrowserProvider:class{async getSigner(){return {address:accounts[0]};}},JsonRpcProvider:class{},formatEther:()=> '0'}:{setNetwork(){},utils:{getBasicFee:async()=>0n,getLinkedListFee:async()=>0n}};
   return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v);},{context});
  });
  await mod.evaluate();assert.equal(await window.iqCodeinChains.evm.connectWallet({onlyIfTrusted:true}),expected);
  assert.ok(calls.every(x=>['eth_accounts','eth_chainId'].includes(x)));
 });
}
