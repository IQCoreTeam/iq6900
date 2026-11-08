import{test}from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import path from'node:path';import{createHash}from'node:crypto';
test('the served client is byte-identical to the companion canonical browser build',async()=>{
 if(!process.env.IQ_PACK_CLIENT_ROOT)throw Error('Set IQ_PACK_CLIENT_ROOT and build before testing the served client');
 const expected=await readFile(path.join(process.env.IQ_PACK_CLIENT_ROOT,'dist/browser.js')),actual=await readFile(new URL('../../../assets/pack-client.js',import.meta.url));
 const hash=value=>createHash('sha256').update(value).digest('hex');assert.equal(hash(actual),hash(expected));assert(actual.length>0);
});
