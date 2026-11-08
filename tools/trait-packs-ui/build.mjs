import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {access,readFile,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url)),assets=path.resolve(here,'../../assets');
if(!process.env.IQ_PACK_CLIENT_ROOT)throw Error('Set IQ_PACK_CLIENT_ROOT to the reviewed iq-inscription-nft/extensions/trait-packs/client checkout');
const client=path.resolve(process.env.IQ_PACK_CLIENT_ROOT);await access(path.join(client,'browser-entry.mjs'));
const manifest=JSON.parse(await readFile(path.join(client,'package.json'),'utf8'));
if(manifest.name!=='iq-trait-packs-client-local')throw Error('IQ_PACK_CLIENT_ROOT is not the reviewed pack client');
await build({bundle:true,platform:'browser',format:'esm',minify:true,define:{'process.env.NODE_ENV':'"production"'},entryPoints:[path.join(here,'src/packs-reveal.jsx')],outfile:path.join(assets,'packs-reveal.js')});
// The companion owns its required web3/Buffer/hash aliases and browser tests.
// Copy that canonical artifact rather than creating a second compiler path.
execFileSync(process.platform==='win32'?'npm.cmd':'npm',['run','build'],{cwd:client,stdio:'inherit'});
const canonical=path.join(client,'dist/browser.js'),output=path.join(assets,'pack-client.js');await copyFile(canonical,output);
const hash=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
if(await hash(canonical)!==await hash(output))throw Error('Copied pack client differs from the canonical companion build');
console.log('Built reveal assets and copied the canonical tested pack client. No deployment performed.');

const sealedCanonical=path.join(client,'dist/sealed.js'),sealedOutput=path.join(assets,'sealed-client.js');await copyFile(sealedCanonical,sealedOutput);if(await hash(sealedCanonical)!==await hash(sealedOutput))throw Error('Sealed client differs from its canonical build');
