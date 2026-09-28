# Local Robinhood wallet fix

The adapter previously used window.ethereum for connection, health checks and signing. With Phantom and MetaMask installed, this could select Phantom without a choice. The reported failed eth_estimateGas explicitly identified zero native balance on Robinhood Chain; it is not evidence that the rejected transaction was sent.

Changes: discover EVM providers via EIP-6963, expose a text-only wallet picker, remember the successfully selected provider identifier, and use that provider for connection, network switch, health checks and event listeners. Legacy injection is a fallback only when no wallet announces. Silent restore does not request accounts or switch networks. Before writing, verify the selected account/network and read its native balance plus the current storage fee. Insufficient storage funds block before calling the SDK. Gas remains wallet-estimated; this lower-bound check does not promise every funded transaction will succeed. Errors no longer assert that nothing or only tiny gas was spent.

Validation: 50 local tests pass, including competing Phantom/MetaMask injection, zero-balance rejection before SDK writes, stale account rejection, trusted restore and existing attachment tests. Real Chrome with both extensions connected MetaMask 0x4a…3073 on the local page and restored it on refresh. No new inscription or mainnet transaction was requested. Local QA: http://127.0.0.1:4413/?menu=hoodin.

I/O: wallet discovery uses browser events, no chain polling. Each write adds account/chain checks, one balance request and one current contract-fee read. Board reads still use gateway caching. No pushes or deployments.
