# Optional pack UI build and local checks

This tool builds the optional pack page from checked-in IQ6900 assets plus the reviewed companion `iq-inscription-nft` client. It does not deploy, sign, or publish artwork. The normal NFT creator remains the default.

```sh
cd tools/trait-packs-ui
npm ci --ignore-scripts
IQ_PACK_CLIENT_ROOT=/path/to/iq-inscription-nft/extensions/trait-packs/client npm run build
IQ_PACK_CLIENT_ROOT=/path/to/iq-inscription-nft/extensions/trait-packs/client npm test
```

Install the companion client's pinned dependencies before building it. Its creator package dependencies are also required by the paired recipe tests. The explicit path prevents a build from silently using an unrelated or stale local checkout. The build invokes the companion's own pinned build script and copies its canonical tested browser client byte-for-byte, preserving its required aliases. The UI tool only bundles the reveal island. A built-artifact test checks the served client SHA-256 against the companion output. The three generated files under `assets/` are ignored; run the build before a local preview or any approved static-site deployment. Serve `assets/` as the web root.

The native `nft_net.js` presets keep `packs: null` by default. An operator enables a reviewed network deployment by replacing that field with explicit `program`, `nftProgram`, `provider`, `providerTreasury` public addresses and an explicit `windowRequests` boolean. No new program ID or enabled market is hardcoded in this candidate. Backend overrides must be the preset API origin or an explicit `packs.apiOrigins` entry. The existing backend health must match the selected cluster and pinned NFT program before activation.

The native NFT bridge then imports the pinned client once, uses the shared Wallet Standard `getWallets()` registry, and derives the creator/collection runtime configuration from that same preset, existing RPC/API selection and cached gateway. There is no manual-global setup step for a configured static-site deployment. `?menu=packs&collection=<address>` uses that configuration inside the existing site shell. The optional creator section stays hidden until configuration is ready; ordinary NFT creation remains the default. Without configuration, packs fail closed without a client import, wallet registry or added RPC work.

An isolated loopback acceptance host may inject an explicit `solana:localnet` runtime with pinned local genesis and loopback RPC/API/gateway. This does not provide a QA signer or enable localnet on a public origin. No test-actor transport or private Nubbies source art is included. The public wrapper defaults to generic IQ branding.

Creator pack preparation is optional. It uses the existing NFT deployment flow, exact validated PNG/WebP source bytes for enabled kits, browser-signed IQ publication, an unsigned catalog/funding plan, and confirmed backend finalization. The host must configure the matching `/creator/packs` API and reviewed deployment. V5 charges the displayed creator price plus 5% IQ surcharge; source publication and operations funding require explicit review. Ordinary collection compression/mint behavior is retained.

These files are a local candidate, not an enabled production rollout. Before activation: review the paired backend/client branch, configure the real deployment and operator funding, verify public-cluster/physical-wallet behavior, and obtain approval for any code or media publication. Private collection source layers, keys and QA server routes must remain outside this repository.

Creator staging/publish/finalize requests now require a wallet-signed login bound to the site, API, chain/genesis and pack program. The short-lived token stays in memory; recovery checkpoints contain no auth token. No spending approval is granted. Wallets must support message signing, as for the existing sale-window request.

History uses Older activity and Latest activity controls. Each response contains two confirmed epochs (up to 64 packs/256 traits), plus currently equipped off-page traits. Navigation replaces the displayed page rather than appending unlimited state, retains wallet-change guards, and uses the existing gateway/reader caches without background polling. Pair with the updated backend; an older backend without page metadata fails closed.
