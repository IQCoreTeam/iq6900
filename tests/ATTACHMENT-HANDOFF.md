# Posting-app return flow

Local follow-up to the inscription viewer work. The existing Code-In UI can be
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

Run `npm test` here for uploader validation, rejected writes and origin checks.
The browser demo exercises actual UI on two loopback ports with simulated funding
and upload, and returns an existing local Surfpool fixture. Real-wallet approval
and the live cross-site deployment still need validation. No mainnet test was run.
