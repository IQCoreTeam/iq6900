# Fork and open-PR audit — September 23, 2026

## Where the latest work is

The newest integrated, tested work is on the three NubsCarson preparation branches, not on every existing PR head:

- [Frontend preparation](https://github.com/NubsCarson/iq-chan/tree/codex/iq-chan-ready-20260923): homepage, media, automatic inscription return, pending-upload guard, inscription-only composer, dependency updates, and bounded browser downloads.
- [Uploader preparation](https://github.com/NubsCarson/iq6900/tree/codex/iq6900-ready-20260923): current upstream Hood In, viewer/funding fixes, automatic return, clearer completion copy, and real Phantom evidence.
- [Gateway preparation](https://github.com/NubsCarson/iq-gateway/tree/codex/iq-gateway-ready-20260923): cache throttle, media, dependency updates and portable lockfile repair.

The prepared branches already include the peer handoff. Original PR branches remain unchanged. Do not fast-forward these combined branches wholesale into a single-purpose PR: that would include unrelated changes. Reconcile each stack deliberately at its intended scope.

## Open PR inventory

Snapshot: 15 open PRs authored by NubsCarson in IQCoreTeam: 4 drafts, 11 non-drafts. None reports GitHub status checks in this snapshot; mergeable means no Git conflict, not tested or approved.

| PR | State | Mergeability | Head branch |
|---|---|---|---|
| [iq-chan #30](https://github.com/IQCoreTeam/iq-chan/pull/30) | Open | No conflicts | `review/iq-chan-home-progress` |
| [iq-chan #31](https://github.com/IQCoreTeam/iq-chan/pull/31) | Draft | No conflicts | `review/iq-chan-inscription-media` |
| [iq-chan #32](https://github.com/IQCoreTeam/iq-chan/pull/32) | Draft | No conflicts | `review/iq-chan-dependencies` |
| [iq-gateway #31](https://github.com/IQCoreTeam/iq-gateway/pull/31) | Open | No conflicts | `codex/cache-local-audit-20260922` |
| [iq-gateway #32](https://github.com/IQCoreTeam/iq-gateway/pull/32) | Open | No conflicts | `review/iq-gateway-inscription-media` |
| [iq-gateway #33](https://github.com/IQCoreTeam/iq-gateway/pull/33) | Draft | No conflicts | `review/iq-gateway-dependencies` |
| [iq-git-cli #4](https://github.com/IQCoreTeam/iq-git-cli/pull/4) | Open | No conflicts | `chore/sdk-v1` |
| [iq-wide-web #3](https://github.com/IQCoreTeam/iq-wide-web/pull/3) | Open | No conflicts | `codex/transaction-viewer-20260916` |
| [iq6900 #4](https://github.com/IQCoreTeam/iq6900/pull/4) | Open | Conflicts | `review/iq6900-viewer-funding` |
| [iq6900 #5](https://github.com/IQCoreTeam/iq6900/pull/5) | Draft | Conflicts | `review/inscription-return-to-post` |
| [iqlabs-solana-sdk #25](https://github.com/IQCoreTeam/iqlabs-solana-sdk/pull/25) | Open | No conflicts | `review/iq-sdk-confirmation-resume` |
| [iqlabs-solana-sdk-python #1](https://github.com/IQCoreTeam/iqlabs-solana-sdk-python/pull/1) | Open | No conflicts | `codex/python-test-dependencies-20260916` |
| [on-chaingit-frontend #7](https://github.com/IQCoreTeam/on-chaingit-frontend/pull/7) | Open | No conflicts | `codex/repository-gallery-rendering-20260916` |
| [on-chaingit-frontend #8](https://github.com/IQCoreTeam/on-chaingit-frontend/pull/8) | Open | No conflicts | `codex/configurable-solana-rpc-20260916` |
| [on-chaingit-frontend #9](https://github.com/IQCoreTeam/on-chaingit-frontend/pull/9) | Open | No conflicts | `codex/iqgit-pages-state-20260916` |

## Review findings and action

- **Real correctness fixes, not justification by test counts:** cache #31 addresses repeated signature scans after cold reads; media previews and automatic return were exercised with actual devnet inscriptions and byte-for-byte readback. SDK confirmation/resume behavior has focused failure coverage. These remain distinct claims from production readiness.
- **Concrete gap fixed in this audit:** the browser media limit was checked only after `response.blob()` downloaded everything. Reuse the existing streaming `readResponseBytes` helper in both browser and server; it now returns standard Uint8Array bytes. Cancel oversized or unsupported bodies. A never-ending chunked response regression verifies download cancellation before exhaustion. No second helper with the same purpose.
- **PR packaging needs reconciliation:** frontend #31 includes #30; frontend #32 includes both. Gateway #33 includes #32. Uploader #5 includes #4. Their bodies disclose those dependencies, so the overlap is intentional, but reviewers must not treat them as independent diffs.
- **Uploader #4 and #5 conflict with current upstream.** The preparation branch already incorporates current upstream, but that does not repair those PR heads. Preserve their individual feature scopes when preparing replacements/rebases.
- **Latest UI and evidence are fork-only.** Existing draft descriptions accurately describe their older heads (including the old URL fallback); they do not describe the new preparation branch. Keep those distinctions explicit until PR heads are updated together with descriptions.
- **No universal clean bill of health:** older Git/Pages/Python/viewer PRs were inventoried for current head, scope, conflict and review state here, not all fully retested in this audit. Their existing evidence is historical. No new Zo review or direct request was present on these open PRs in this snapshot.

## Validation boundary and next steps

[Real Phantom evidence and deployment requirements](phantom-devnet-20260923.md) includes ten finalized devnet transactions, byte-exact media and browser playback. The local success used the patched SDK, not the published package unchanged.

No-mainnet/no-deployment work can include scoped conflict reconciliation, dependency/advisory review, physical testnet-wallet checks and local cross-origin checks. Do not manufacture mainnet proof, silently release an SDK, or turn every optional cleanup into another PR.

Before a production release: deliberately integrate/release the patched SDK; deploy media and uploader return before the frontend; verify deployed CSP/opener behavior and physical mobile-wallet flow. The older primary gateway can stop media fallback on 404, so gateway rollout order remains material.

This audit creates no new PRs, changes no draft state, merges nothing, and performs no mainnet writes or deployments. It checkpoints fixes and this inventory on the preparation forks.
