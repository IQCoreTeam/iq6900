# Local NFT verification — 2026-10-23

Frontend base: `bc3cc1ac92a0f24867e06e62e258a8ae8c8ca8cb` (`feat/inscription-nft`). Backend base: `34b1c2c6a6829fe1105509df54033c81785dcebd`.

## Checks

- `cd tests && npm test`: 126 tests pass. Covers cluster routing, confirmation/error handling, write-before-notify ordering, resume behavior, creator logo/banner hints and feed compatibility.
- Actual frontend deploy/mint engines created a new collection and Core NFT on a local Solana validator using generated test wallets and fake SOL. The real backend and gateway routes verified the owner and image/metadata hashes, ingested one image-row notification and served cached reads. Burner balance ended at zero.
- Three warmed reads each of the feed, image and metadata added zero RPC calls. The gateway retains its existing request-triggered, throttled head refresh; warm-up/background work is reported separately in `approval-cache-recheck.json`.
- 320px collection/home/viewer, 390px metadata and 1280px desktop checks are in `final-responsive-browser.json`. Narrow navigation and explorer links fit; popup headers remain reachable and desktop centring remains.

## Evidence boundaries

Upload staging/compression were simulated in the local mint. The harness explicitly mapped the pinned local genesis to the loopback gateway and aligned the QA server clock with the retained validator clock; production cluster routing and deposit-age checks were not weakened. These QA substitutions are not part of the patch.

Screenshots show the actual page module/HTML over a read-only QA bridge to the local backend and gateway. The green square is a tiny real local inscription. Wallet actions and chain-recovery controls are disabled in this preview. Its cache-check banner is QA-only.

Live Irys upload, live Tensor ingestion, production deployment and physical-phone wallet acceptance are not claimed. No personal keys, QA servers or network overrides are included.
