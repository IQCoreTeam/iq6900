import {build} from 'esbuild';
import {gzipSync} from 'node:zlib';
import {readFile,writeFile} from 'node:fs/promises';
import {writeBundleLicenses} from '../vendor-licenses.mjs';

const shared = {
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  external: ['@solana/web3.js'], // Keep the site's existing web3 instance.
  metafile: true,
  minify: true,
  legalComments: 'eof',
};
const result = await build({
  ...shared,
  entryPoints: ['../../assets/js/codein/wallets.js'],
  outfile: '.test-build/wallets.js',
  plugins: [{
    name: 'local-transports',
    setup(b) {
      b.onResolve({filter: /wallet-transports\.js\?v=/}, () => ({
        path: new URL('./src/transports.js', import.meta.url).pathname,
      }));
    },
  }],
});
const transports = await build({
  ...shared,
  entryPoints: ['src/transports.js'],
  outfile: '../../assets/js/codein/wallet-transports.js',
});
await writeFile('.test-build/metafile.json', JSON.stringify({wallets: result.metafile, transports: transports.metafile}, null, 2) + '\n');
const bytes = await readFile('.test-build/wallets.js');
await writeFile('.test-build/build.json', JSON.stringify({bytes: bytes.length, gzipBytes: gzipSync(bytes).length}, null, 2) + '\n');

await writeBundleLicenses(transports.metafile, '../../assets/js/codein/wallet-transports.LICENSE.txt');
console.log({bytes: bytes.length, gzipBytes: gzipSync(bytes).length});
