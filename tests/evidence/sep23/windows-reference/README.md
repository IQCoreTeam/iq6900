# Reference scripts from the successful Windows/WSL run

These scripts produced the September 23 evidence. They are retained for audit and adaptation, not offered as a portable test package. They retain machine-specific checkout, Playwright-runtime, artifact and keypair paths. Do not run them unchanged on another computer.

- `build-sep23.ts`: Bun bundles the actual SDK/uploader with explicit devnet RPC, gateway and cluster replacements. Exposes a dedicated test-signer installer; no private key is served by the web app.
- `serve-sep23.ts`: serves actual IQ6900 assets and gateway routes; proxies only to public devnet after verifying its genesis hash. An old unused parent-demo endpoint remains on port 3222; the recorded run used the full frontend on 3220.
- `test-sep23-real-apps.cjs`: opens actual BlockChan, uses a connection-only Wallet Standard adapter for its post form, signs the upload in the actual uploader with a dedicated devnet key, verifies automatic return, draft preservation, exact media bytes and manual fallback.
- `test-sep23-production.cjs`: verifies manual attachment and audio playback against the production frontend without a new inscription.
- `verify-sep23.mjs`: checks finalized public-devnet receipts and burner refund.

To port them: replace checkout/runtime/artifact paths, install Playwright and Chromium, and generate your own dedicated devnet keypair outside the repo. The posting-app adapter must use that keypair's matching public address; the original public address is hardcoded in both browser tests. Use the included WAV fixture and update its path. Create artifact directories before building. Keep the devnet genesis check and fixed devnet RPC.

No key file is included. Do not copy a real wallet's key into these scripts or run against mainnet. Phantom extension testing remains a separate outstanding check.
