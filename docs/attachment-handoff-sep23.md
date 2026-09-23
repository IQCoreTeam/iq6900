# Attachment integration handoff — NOT READY

This is a fork-only integration snapshot. It does not approve a PR, merge or deployment. Continue locally, on devnet or Surfpool; do not spend mainnet funds. Book work remains deferred.

## Check out these branches together

| Component | Fork branch | Tested source commit |
| --- | --- | --- |
| Uploader | [NubsCarson/iq6900 — handoff/attachments-sep23](https://github.com/NubsCarson/iq6900/tree/handoff/attachments-sep23) | `8e6e77a` before handoff documentation |
| Gateway | [NubsCarson/iq-gateway — handoff/attachments-sep23](https://github.com/NubsCarson/iq-gateway/tree/handoff/attachments-sep23) | `8d4e20f` before handoff documentation |
| Frontend | [NubsCarson/iq-chan — handoff/attachments-sep23](https://github.com/NubsCarson/iq-chan/tree/handoff/attachments-sep23) | `4f1105e` before handoff documentation |
| SDK | [NubsCarson/iqlabs-solana-sdk — review/iq-sdk-confirmation-resume](https://github.com/NubsCarson/iqlabs-solana-sdk/tree/review/iq-sdk-confirmation-resume) | `037e2e344b288723554a7ab50f286631ec39c512` |

The local SDK source used for the signed run matched that SDK commit, including staged changes in its original working directory. Build and use that SDK checkout; do not silently substitute the unpatched published 0.3.6 package and claim the same result. SDK PR #25 remains open.

The uploader was integrated onto Zo's `1e3c78c` master (HOOD IN). Frontend main was `592527b`; gateway main was `d6fa6a4`. Recheck upstream before further integration.

Existing PR branches were not rewritten: uploader #5 and frontend #31 remain drafts; gateway #32 has not automatically received this follow-up. Uploader #5's old branch still conflicts until deliberately updated or superseded. Its prerequisite viewer/funding fixes from uploader #4 are included here.

## Changes

- Preserves Zo's HOOD IN adapter, ID3 metadata, filenames, ASCII controls, inventory source and tab-loading fixes while retaining automatic attachment return.
- Accepts Code In's encoded `;name=...;base64,` parameter in the uploader and gateway. HTML/SVG and malformed media stay rejected; filenames are not used as paths or response headers.
- Preserves the original Attachment URL field, automatic return, copyable share link, closed-parent recovery and separate Post action. Uploading never posts a thread by itself.
- Automatic return carries Solana signatures only. HOOD IN remains a standalone EVM upload flow. Native EVM automatic attachment is not implemented; an EVM hash must never be reported as a Solana signature.

## Evidence and limits

- 26 uploader tests, 149 gateway tests and 75 frontend tests passed.
- Frontend TypeScript and production build passed. Installed dependencies were reused; clean-install reproduction is still needed on the receiving machine.
- Full real BlockChan + IQ6900 browser flow uploaded a 4,044-byte WAV named `my track; #1 (live).wav`, returned it automatically and preserved the draft.
- Manual paste worked, gateway bytes matched exactly, and audio played to completion in the production frontend build (0.25 seconds, no media error).
- Five real public-devnet transactions finalized without errors. Spend: 0.003025 devnet SOL. Burner refunded to zero. No mainnet writes.
- The uploader used a generated devnet signer; the posting form used a connection-only Wallet Standard test adapter. This was not a Phantom extension test, and no thread/reply was posted. HOOD IN coverage is an isolated UI regression, not a signed EVM upload.

[Browser result](../tests/evidence/sep23/browser-result.json) · [Finalized receipts](../tests/evidence/sep23/verified-receipts.json) · [Playback result](../tests/evidence/sep23/production-smoke.json) · [Build log](../tests/evidence/sep23/frontend-build.log) · [Reference runners](../tests/evidence/sep23/windows-reference/README.md)

![Automatic attachment in the actual BlockChan form](../tests/evidence/sep23/automatic-return-real-blockchan.png)
![Completed upload in the actual IQ6900 page](../tests/evidence/sep23/confirmed-real-iq6900.png)

## Next agent: ordered work

1. Clone the four branches, verify their heads and install from each lockfile. Build the SDK and record source/dependency versions. Run uploader `cd tests && npm ci && npm test`; gateway `bun test`; frontend `npm ci && npm test && npx tsc --noEmit && npm run build` (Bun required).
2. Adapt the reference runners to the receiving machine. Start the actual apps with explicit devnet endpoints and a dedicated test wallet; preserve the genesis check. Recorded frontend settings: `NEXT_PUBLIC_INSCRIPTION_URL=http://localhost:3221/`, `NEXT_PUBLIC_RPC_ENDPOINT=http://localhost:3221/rpc`, `NEXT_PUBLIC_GATEWAY_URL=http://localhost:3221`, `NEXT_PUBLIC_NETWORK=solana`. The uploader build also replaces its compiled mainnet RPC/gateway/cluster; frontend settings alone do not switch the uploader.
3. Test actual Phantom connection, funding signature, upload and returned media. On devnet, exercise a thread and reply if test-board permissions allow. Verify cancellation, rejected signatures, closed/reloaded popup, delayed return and manual recovery. Review Post-while-uploading: the current listener stops when the form becomes disabled, leaving the saved link as recovery. Decide whether posting should wait or explicitly proceed without the pending attachment; do not claim that race is resolved.
4. Check mobile behavior and intended hosting headers, especially opener isolation/COOP. Loopback success does not prove production cross-origin behavior. Add a signed EVM testnet/local-chain test if expanding HOOD IN integration; do not spend Robinhood mainnet funds.
5. Review PR overlap and coordinate the SDK/uploader/gateway/frontend rollout. Obtain Nubs/Zo review before marking drafts ready or deploying. Update old PR branches deliberately; do not blindly force-push rewritten uploader history over concurrent work.

These notes record work and remaining checks. They do not independently authorize messages to Zo, new issue comments, further pushes or deployment; follow the receiving task's user instructions.
