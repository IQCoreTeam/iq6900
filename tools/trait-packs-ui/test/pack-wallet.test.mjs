import {test} from 'node:test';
import assert from 'node:assert/strict';
import {guardPackCreator} from '../../../assets/js/codein/pack_wallet.mjs';
const key = value => ({toBase58:()=>value});
test('creator funding cannot follow a wallet switch during an RPC lookup',async()=>{
 let signed=0;
 const provider={publicKey:key('creator'),signTransaction:async tx=>{signed++;return tx;}};
 const guarded=guardPackCreator(provider);
 await Promise.resolve();provider.publicKey=key('other');
 assert.throws(()=>guarded.publicKey,/wallet changed/);
 await assert.rejects(()=>guarded.signTransaction({}),/wallet changed/);
 assert.equal(signed,0);
});
test('creator continuity is checked after signing and burner derivation prompts',async()=>{
 for(const method of ['signTransaction','signMessage']){
 const provider={publicKey:key('creator'),[method]:async value=>{provider.publicKey=key('other');return value;}};
 const guarded=guardPackCreator(provider);
 await assert.rejects(()=>guarded[method]({}),/wallet changed/);
 }
});
