# Local launch UX follow-up

Scope: explain staged launch costs and make IQ registry publication an explicit post-launch action; restore previously approved wallets without signatures or prompting network changes.

Token creation success no longer immediately triggers another paid registration. Done screen offers REGISTER ON IQ BOARD with a funding explanation, and a single-flight guard prevents duplicate registration clicks. Metadata/network spending is disclosed before launch and in launch errors, rather than saying nothing was spent.

Solana calls connect({onlyIfTrusted:true}); locked/unapproved wallets keep the Connect button. EVM checks eth_accounts and the existing chain before restoring its signer. No eth_requestAccounts or switch-chain request in silent mode. Account/disconnect/chain-change events invalidate the display and burner state; listeners are removed on route change and stale reconnect results ignored. No keys/signatures persisted.

Tests: node --experimental-vm-modules --test tests/launch-wallet-ux.test.cjs tests/evm-trusted-wallet.test.cjs — 11 pass. Simulated providers and chain writes only; no mainnet writes or deployment. Browser wallet-extension validation remains separate.

Not included: durable pending-launch recovery, deduplication by inscription, creator verification, or custom quote-token pairing. These need their own state/ownership decisions. This branch is local for review; it does not update existing PRs.

## Gateway notification budget

Before: confirmed registration -> notify (gateway fallbacks, 4-second timeout each) -> full markets reload (up to 8 board pages plus price enrichment). Notification exceptions appeared as registration failures.

After: confirmed registration -> insert the known token into the existing local markets list -> notify using the existing bounded adapter. No new board reads or price requests on this path. Existing periodic market refresh is unchanged. Keep the current confirmed registration visible while a stale gateway catches up. A failed notification never enables another paid write; this is in-memory state only, not durable recovery.

Measured with the same UI harness for notification success, false, and exception: one inscription, one notification invocation, zero board reads after registration in each case. A repeated button event produces no additional inscription or notification. These are simulated failure-path tests, not live-chain proof.

Remaining limitations: the registry scan is bounded to 400 recent rows; links are recorded references, not creator verification. Browser extension QA and reconciliation of other PR branches are separate acceptance gates. Nothing in this follow-up is pushed or deployed.
