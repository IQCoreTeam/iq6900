# Local candidate checkpoint

User-approved fork checkpoint; no deployment or mainnet transactions.

Frontend d4a487e: canonical transaction-ID attachment input, chain-matched uploader/return, on-chain marker, bounded previews, and safe original-file actions. Uploader includes upstream through f2254c1 (Ethereum SDK 0.4.1), Robinhood return, copy-ID, board markers, and awaited wallet RPC check. Existing drafts still represent their separately named review branches until reconciled.

Validation: 89 frontend tests; 35 uploader tests; 160 gateway tests; TypeScript and frontend production build. Earlier paired Solana/Robinhood browser simulations and 390px visual checks remain separate from signed execution.

Signed local checks: 37 fresh + 39 existing-burner Surfpool transactions with exact readback and refund; packed patched SDK consumed from a tarball passed another 37 transactions. Latest EVM SDK 0.4.1 test wrote a 192,044-byte WAV across multiple batches on local Anvil, verified inventory and linked-row media exact bytes, 206/416 ranges and executable payload rejection. See tests/evidence/local-final-20260925.

Anvil reads Robinhood state as a fork source but signs/sends only to loopback with disposable synthetic-funded wallets. Surfpool successful runs were offline. No user private key exported. This does not establish production sequencer acceptance or physical-wallet/device behavior.

SDK release gate: Solana patch 037e2e3 remains in SDK PR #25, not published 0.3.6. Publish a new version through maintainer release process, then update app alias/importmap and retest. Never republish the patched local 0.3.6 tarball as registry 0.3.6.

PR scopes: gateway #31 cache independent; #32 media; #33 dependencies. Uploader #4 funding/viewer; #5 return/UI including #4 dependency. Frontend #31 attachment UI; #32 dependencies. Reconcile these individually; do not label combined checkpoint test results as proof of unchanged old heads. Physical phone testing deferred by user.
