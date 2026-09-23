# Code-In v2 handoff

Model B (browser burner) inscription for iq6900. The on-chain flow is verified
end to end on devnet; the UI is a working first slice that needs in-browser
testing. Plan and diagrams: IQCoreTeam/iq6900 issue #3.

## Branches
- iq6900: `feat/code-in-v2` (this branch)
- iqlabs-solana-sdk: `feat/writerow-speed` (version 0.3.1; adds `writeRow(..., { speed, onProgress })`)

## What is done (verified on devnet)
- Deterministic burner from one wallet signature, reused so the ~0.05 SOL
  account-init rent is paid once per user (inscribe #1 0.0516 SOL, reused #2
  0.0010 SOL).
- Inscribe writes into the global feed table and references the user
  inventory PDA, so one write is discoverable under both the board (feed
  table) and my inventory (user PDA). No contract change.
- Reads go through the gateway (gateway.iqlabs.dev), not per-tx RPC, so
  opening the board is one cached HTTP call instead of a 429 storm. After a
  confirmed write we POST /table/{pda}/notify so the row shows immediately.
  Same pattern as iq-chan (see its src/lib/gateway.ts). The gateway is
  MAINNET-ONLY: on devnet it 500s and the board reads back empty (handled
  gracefully) -- to see the board populate, put the feed on mainnet.
- Free-RPC size cap measured at 32KB (0 x429 at light 2rps, ~59s); 64KB+ hits
  429s (recovered). Above the cap, recommend own RPC or the SDK.

## File map
- `feed.js` single source of truth for the feed db_root/table PDAs
- `burner.js` deriveBurner(signMessage)
- `cost.js` estimateCost(bytes, { firstTime })
- `inscribe.js` fund (user signs once) -> writeRow(feed, [userInv]) -> sweep
- `browser.js` ESM bridge, exposes window.iqCodein (writes via RPC, reads +
  notify via the gateway) and fires "iqcodein:ready"
- `admin/setup-feed.mjs` one-time db_root + createTable
- `test/devnet.mjs`, `test/speed.mjs` node checks (need a funded keypair arg)
- UI: `../../html/sections/code_in_v2.html` + `../sections/pages/code_in_v2.js`,
  wired from `../../index.html` (process shim + importmap + nav entry)

The feed on devnet is already set up (db_root label "iq6900-codein-feed-v1",
feed table 3p1BeC2h2YeR51n4yGp4shv21P6QQ6q6phev2JDN54gA).

## Next steps

1. Publish the SDK, then point the site at it:
   - cd iqlabs-solana-sdk, merge `feat/writerow-speed` to main, `npm publish` (0.3.1)
   - in iq6900 `assets/index.html` importmap, bump the SDK 0.3.0 to 0.3.1
   (Until then the browser uses 0.3.0, which ignores the speed/onProgress options.)

2. Test in a browser (importmap/ESM need http, not file://):
   - cd iq6900/assets && python3 -m http.server 8080
   - open http://localhost:8080 , click "Code In", connect Phantom, inscribe a
     text note; the write goes to public devnet and the sig shows on success
   - NOTE: the board reads from the mainnet-only gateway, so on devnet the
     board stays empty even after a successful write. Visual board/My-Inventory
     confirmation needs the feed on mainnet (step 4).

3. Fill out the full design (see Code In Flow.dc.html): ASCII (generator
   settings), image, file types; the XSS-safety popup; the over-cap screen;
   the resume/tab-close details; wallet-adapter edge cases.

4. Mainnet: run `RPC=<mainnet> node admin/setup-feed.mjs <owner.json>` to create
   the feed there, point browser.js DEFAULT_RPC + the importmap at mainnet or
   the gateway, then merge to master.

## Hood In (Robinhood Chain mirror, 2026-09-24)

The same page module now drives two chains. `?menu=codein` loads the solana
adapter (browser.js, Model B burner); `?menu=hoodin` dynamic-imports evm.js
(Model A: the USER WALLET signs each tx sequentially, no burner - EVM
inventory is keyed by msg.sender, so a burner would break it). Both adapters
register in window.iqCodeinChains and expose the same window.iqCodein surface;
code_in_v2.js branches only on isEvm() for wallet flow, cost units and copy.
Theme = CSS variables in code_in_v2.html (#ci2 cream vs #ci2.hood green, from
Hood In Flow.dc.html).

EVM feed: db_root "iq6900-codein-feed-v1" / table "global-feed" on Robinhood
mainnet (chainId 4663, contract 0x88af59e5..., created 2026-09-23 by
0x29f31849..., key in ~/Desktop/deploy/robinhood-deployer.key.txt). Reads go
through gateway.iqlabs.dev with ?network=robinhood (__txHash is mirrored to
__txSignature); "my inventory" filters the feed by the who column because
writeRow does not touch the per-user codeIn chain. Cap = 25 signatures
(sigs = 2 inline, else batches+2 at ~94KB base64/batch), over it the cap modal
offers SDK or an explicit continue. The public RPC (rpc.mainnet.chain.
robinhood.com) is CORS-open; the wallet broadcasts txs through its own RPC.
