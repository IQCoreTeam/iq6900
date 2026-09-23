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

Run `npm test` in this directory. Tests cover successful/failed return, exact
origin checks and preserving the manual link when the posting window has closed.
`evidence/devnet-attachments.json` contains independently retrieved finalized
public-devnet receipts and exact-readback results. The real signed upload used a
generated test key and the separate local SDK confirmation/resume fix. It used
explicit devnet build settings; production still requires mainnet for attachments.

Still needed: full-app Phantom signing/posting validation, mobile/popup recovery,
live cross-origin integration, and Nubs/Zo review. The frontend and gateway media
route must be coordinated with this change. No mainnet test or deployment.
