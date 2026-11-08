import test from 'node:test';
import assert from 'node:assert/strict';
import {solanaMarketUrl} from '../../../assets/nft-market-links.mjs';
const asset='So11111111111111111111111111111111111111112';
test('market links retain the actual asset and are only offered on explicit mainnet',()=>{
  assert.equal(solanaMarketUrl(asset,'solana:mainnet'),'https://magiceden.io/item-details/'+asset);
  for(const chain of ['solana:devnet','solana:localnet','eip155:4663',undefined])assert.equal(solanaMarketUrl(asset,chain),null);
  for(const value of ['https://attacker.example','../file','<script>',asset+'?x=1','0'.repeat(44),null])assert.equal(solanaMarketUrl(value,'solana:mainnet'),null);
});
