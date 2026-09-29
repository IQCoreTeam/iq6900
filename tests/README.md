# Local regression tests

From this directory, use Node.js 22 or newer:

```sh
npm ci --ignore-scripts
npm test
```

These tests execute the checked-in page scripts in jsdom and the transfer module
with Node's VM module linker. SDK, RPC, wallet and transaction dependencies are
stubbed for the transfer tests. No network requests, real wallets or funds are
used. Synthetic records never leave the test process.

Covered: untrusted feed metadata, executable file links, image/audio/file/text
rendering, legacy player initialization, funding execution failures, refund
execution failures, expiry polling, successful refunds, and rent quotes for new,
initialized, undersized and foreign-owned inscription accounts. Media DOM assertions
do not establish browser codec support; the transfer tests do not replace a
signed local-validator integration test.

## Signed local integration

With the IQ program already installed in offline Surfpool on port 19109 and a
built SDK checkout, run:

```sh
IQ_LOCAL_RPC=http://127.0.0.1:19109 IQ_SDK_DIR=/absolute/path/to/sdk \
  node --experimental-vm-modules local-inscribe.cjs
```

The application transfer module and its cost calculator run unchanged, with a
synthetic feed identity replacing the production feed. The test creates keys in
memory, funds them with simulated SOL, interrupts and retries a 45.6 KB upload,
checks exact SDK readback, then uploads an original two-second WAV without an
injected failure. It verifies the burner refund and every transaction receipt.
It rejects nonlocal writes and mainnet genesis. No browser funding dialog is tested.

The fresh-burner path passed with the locally patched SDK 0.3.6: 37 successful
receipts, one deliberate text-upload interruption, zero retries for the media
upload, exact readback, and a zero burner balance after refund. Funding now quotes
missing account rent instead of using the insufficient fixed initialization
allowance. The preview includes a conservative fee buffer, not a live fee quote.

Set `IQ_EXISTING_BURNER=1` to test the initialized-burner path separately. It first
initializes the disposable burner with simulated funds and sweeps its balance to
zero. The ordinary application then funds, writes, retries and refunds it. This
path is distinct from the fresh-wallet test. `IQ_TEST_REPORT=/absolute/path/report.json`
saves receipts and the media signature for a gateway route integration test.

The interruption test requires the SDK confirmation/resume patch under review;
the published 0.3.6 package does not include that unpublished fix. The browser
and the Node manifest both select official 0.3.6; a future SDK release is needed
before claiming the application's interruption behavior is fixed in production.
