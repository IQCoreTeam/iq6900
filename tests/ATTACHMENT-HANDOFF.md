# Posting-app return flow — NOT READY

Draft follow-up to the inscription viewer work. Not fully tested or approved by
Nubs or Zo; do not merge or deploy yet. The existing Code-In UI can be
opened with `attachmentOrigin` and a UUIDv4 `attachmentRequest` query parameter.
It opens the file composer, retains the normal wallet/SDK/funding/refund flow,
then returns a successfully completed public signature to the requesting popup
opener. It never automatically posts a BlockChan/HoodChan thread or reply.

Allowed production return origins: `https://blockchan.sol.site`,
`https://hoodchan.xyz`, `https://blockchan.ar.io`. Loopback origins are accepted
only by a loopback-hosted uploader. Origin strings must be exact origins, with
no path/credentials. Completion/acknowledgement include the same request ID;
acknowledgements must come from the original opener and origin.

Attachment mode supports the passive media MIME types accepted by the gateway
and requires the application's mainnet Solana network. Ordinary standalone
uploads are unchanged. A rejected/unsupported upload sends no completion. If the
post window closes, the inscription is still saved and can be opened from the
board. Retry attaching sends the same public result; it does not re-inscribe.

Successful uploads expose a readonly inscription URL, Copy link and Open
inscription. If clipboard access fails, the URL is selected for manual copying.
Closing the parent does not remove the saved link. Attachment mode skips
automatic feed scans on open/connect/completion; explicit navigation still works.

Local September 23 integration is based on upstream `1e3c78c` (HOOD IN).
The filename parameter added by Code In is accepted for supported passive media;
this requires the matching gateway media-parser update. HOOD IN remains on its
EVM adapter and is excluded from the Solana automatic-return protocol. Its
standalone completion still exposes the normal HOOD IN share link.

Run `npm test` in this directory. Tests cover successful/failed return, exact
origin checks and preserving the manual link when the posting window has closed.
`evidence/devnet-attachments.json` contains independently retrieved finalized
public-devnet receipts and exact-readback results. The real signed upload used a
generated test key and the separate local SDK confirmation/resume fix. It used
explicit devnet build settings; production still requires mainnet for attachments.

The September 23 full-app test used the actual BlockChan and IQ6900 pages,
a dedicated devnet signer, and the local SDK fix from SDK PR #25. All five
transactions finalized successfully. A 4,044-byte WAV named
`my track; #1 (live).wav` returned to the draft automatically, reconstructed
byte-for-byte through the gateway, and worked through the manual URL field.
The production frontend build passed; browser playback completed without error.
This is real devnet evidence, not a Phantom extension test. HOOD IN coverage is
an isolated UI regression, not a signed EVM upload.

Still needed: full-app Phantom signing/posting validation, mobile/popup recovery,
live cross-origin integration, and Nubs/Zo review. The frontend and gateway media
route must be coordinated with this change. No mainnet test or deployment.
