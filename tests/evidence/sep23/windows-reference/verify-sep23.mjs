import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire('/home/linbox/.local/state/iq-local-review/iq6900-media/assets/js/codein/package.json');
const {Connection,Keypair}=require('@solana/web3.js');
const {ed25519}=await import('/home/linbox/.local/state/iq-book-rehearsal/sdk036-review/node_modules/@noble/curves/ed25519.js');
const {deriveBurner}=await import('/home/linbox/.local/state/iq-local-review/iq6900-media/assets/js/codein/burner.js');
const owner=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync('/home/linbox/.local/state/iq-local-review/devnet-attachment/wallet.json','utf8'))));
const burner=await deriveBurner(async msg=>ed25519.sign(msg,owner.secretKey.slice(0,32)));
const c=new Connection('http://127.0.0.1:3221/rpc','confirmed');
const genesis=await c.getGenesisHash();assert.equal(genesis,'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
const root='/mnt/c/Users/Untra/Git/iqlabs/iq-local-review-evidence/sep23/devnet-evidence/';
const browser=JSON.parse(readFileSync(root+'browser-result.json','utf8'));
const signatures=[...new Set(browser.evidence.signatures)];
const statuses=(await c.getSignatureStatuses(signatures,{searchTransactionHistory:true})).value;
const receipts=[];
for(let i=0;i<signatures.length;i++){
 assert(statuses[i]);assert.equal(statuses[i].err,null);assert.equal(statuses[i].confirmationStatus,"finalized");
 const tx=await c.getTransaction(signatures[i],{maxSupportedTransactionVersion:1});assert(tx?.meta);assert.equal(tx.meta.err,null);
 receipts.push({signature:signatures[i],status:statuses[i].confirmationStatus,slot:tx.slot,version:tx.version,feeLamports:tx.meta.fee,err:tx.meta.err});
}
const balance=await c.getBalance(owner.publicKey),remaining=await c.getBalance(burner.publicKey);assert.equal(remaining,0);
const first=await c.getTransaction(signatures[0],{maxSupportedTransactionVersion:1});
const ownerIndex=first.transaction.message.staticAccountKeys.findIndex(k=>k.equals(owner.publicKey));
const before=first.meta.preBalances[ownerIndex];
const report={genesis,owner:owner.publicKey.toBase58(),burner:burner.publicKey.toBase58(),ownerBeforeLamports:before,ownerRemainingLamports:balance,devnetLamportsSpentThisRun:before-balance,burnerRemainingLamports:remaining,receipts,exactMediaReadback:browser.exactMediaReadback,mediaSignature:browser.signature,mainnetWrites:0};
writeFileSync(root+'verified-receipts.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
