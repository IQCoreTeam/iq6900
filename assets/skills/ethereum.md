---
name: iqlabs-ethereum
version: 2.0.0
description: IQLabs SDK on Ethereum (Sepolia) — TypeScript reference for on-chain data, IQDB tables, connections, and encryption
---

# IQLabs SDK — Ethereum (Sepolia)

The Ethereum port of the IQLabs SDK. Same four primitives (Code In, IQDB tables, connections, encryption) built on `ethers v6` and a single deployed contract.

> Full docs: https://iqlabs.mintlify.app/docs-ethereum
> npm: `@iqlabs-official/ethereum-sdk`

> **Mainnet ETH is not deployed yet.** This SDK currently targets **Sepolia testnet** and **Monad** (see [`fetch_skill("monad")`](https://iqlabs.dev/skills/monad.md)).

## Install

```bash
npm i @iqlabs-official/ethereum-sdk
```

CommonJS for Node.js; works in browsers via any modern bundler.

---

## Network

The SDK ships with multiple network modes — default is `sepolia`. Switch once at app startup.

| Mode | Chain ID | Currency | Contract | Default RPC |
|------|---------:|----------|----------|-------------|
| `sepolia` | 11155111 | ETH | [`0x246A08D9fdD9b3990A88eD1f2DF1A87239839F07`](https://sepolia.etherscan.io/address/0x246A08D9fdD9b3990A88eD1f2DF1A87239839F07) | `https://ethereum-sepolia-rpc.publicnode.com` |
| `monad` | 143 | MON | [`0x7ae06f87Cf93606DA2BD6A281afB28028cAE233D`](https://monadvision.com/address/0x7ae06f87Cf93606DA2BD6A281afB28028cAE233D) | `https://rpc.monad.xyz` |
| `robinhood` | 4663 | ETH | [`0x88af59e58C7E5DcbE7cc12972B90cff3fEEF7223`](https://robinhoodchain.blockscout.com/address/0x88af59e58C7E5DcbE7cc12972B90cff3fEEF7223) | `https://rpc.mainnet.chain.robinhood.com` |

```typescript
import iqlabs from '@iqlabs-official/ethereum-sdk';

iqlabs.setNetwork('sepolia'); // default
```

Reader RPC priority: explicit `setNetwork(mode, rpcUrl)` / `setRpcUrl(url)` → env vars (`IQLABS_RPC_ENDPOINT`, `ETHEREUM_RPC_URL`, `RPC_URL`) → mode default. Writers use whatever provider you attached to the `Signer`.

---

## Wallet / Signer setup

### Node.js (private key)

```typescript
import { Wallet, JsonRpcProvider } from 'ethers';

const provider = new JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
const signer = new Wallet(process.env.PRIVATE_KEY!, provider);
```

### Browser (MetaMask / injected)

```typescript
import { BrowserProvider } from 'ethers';

const provider = new BrowserProvider(window.ethereum);
await provider.send('eth_requestAccounts', []);
const signer = await provider.getSigner();
```

Reader functions don't need a signer — they use the configured RPC.

---

## Core concepts

### Code In

Data is inscribed into transaction calldata; nothing is written to contract storage. Reads reconstruct by walking a tx linked list.

- **Inline** (≤ 700 bytes): single tx, no chunking
- **Linked list**: chunks via `sendCode()` in batches up to ~96 KB

### User State

No "create user" step. The first `codeIn()` writes both the inventory entry and bumps the user's tx-chain tail.

### Connection State

Two-address relationship: `0` pending / `1` approved / `2` blocked. Only the blocker can unblock. The seed is computed deterministically via `deriveDmSeed(userA, userB)` (sorted lowercase + keccak256), so either party can recompute it.

### Database Tables

Unlike Solana, **tables must be created before `writeRow()`**:

1. `initializeDbRoot(dbRootId)` once per namespace — caller becomes the **DbRoot creator** and the only one allowed to update permissions or schema.
2. `createTable(...)` (public) or `createTable(..., isPrivate=true)` — charges `tableCreationFee` (default 0.0003 ETH, split 31% `feeReceiver` / 69% DbRoot creator).
3. `writeRow(...)` to append.

A table is uniquely identified by `dbRootId + tableName`. Both are stored on-chain so the SDK can list them without a hardcoded lookup.

### Token & Collection Gating (ERC-20 / ERC-721)

```typescript
gate?: {
  tokenAddress: string;    // ERC-20 or ERC-721 contract (ZeroAddress for public)
  amount: number | bigint; // raw token units (ERC-20 only; ignored for ERC-721)
  gateType: 0 | 1;         // 0 = ERC-20, 1 = ERC-721
}
```

- ERC-20 `amount` is in raw units — for 18-decimal tokens use `parseEther('100')`, not `100`. If `amount == 0`, the contract treats it as `1`.
- ERC-721 collection gate requires `balanceOf(user) >= 1`. `amount` is ignored.
- **ERC-1155 is not supported.**

### Table Creation Permissions

| Bucket | Function | Listed in `tables`? | Permission field |
|--------|----------|---------------------|------------------|
| **Public** | `createTable(..., isPrivate=false)` | yes | `tableCreators` |
| **Private** | `createTable(..., isPrivate=true)` | no — only in `globalTables` (must know name) | `extCreators` |

Empty list = anyone. **The DbRoot creator is *not* automatically allowed** under a non-empty allowlist — they must add themselves.

### Fees

| Fee | Default (Sepolia) | Charged on |
|-----|-------------------|------------|
| `basicFee` | 0.0001 ETH | inline `codeIn` / `writeRow` / `writeConnectionRow` |
| `linkedListFee` | 0.0003 ETH | the same when payload is chunked |
| `tableCreationFee` | 0.0003 ETH | `createTable` (split 31% feeReceiver / 69% DbRoot creator) |
| `discountFee` | 0.00005 ETH | replaces `basicFee` on inline path when signer holds the IQ token |

Free (gas-only): `updateTableTxChainTail`, `updateConnectionTxChainTail`, `updateUserTxChainTail`, `requestConnection`, `manageConnection`, `dbInstructionCodeIn` (row edits).

---

## Function reference

### Data Storage

#### `codeIn(signer, data, filename?, filetype?, onProgress?)`

| **Returns** | tx hash (string) |
|---|---|

```typescript
// Inline (small)
const txHash = await iqlabs.writer.codeIn(signer, 'Hello, blockchain!');

// Chunked, with filename + progress
const txHash2 = await iqlabs.writer.codeIn(
  signer,
  longString,
  'hello.txt',
  'text/plain',
  (pct) => console.log(`upload: ${pct.toFixed(1)}%`)
);
```

Internally fires `sendCode()` chunks (for large data) + `userInventoryCodeIn` (charges fee) + `updateUserTxChainTail` (free).

#### `readCodeIn(txHash, onProgress?)`

| **Returns** | `{ metadata: { handle, typeField, offset, beforeUserTx }, data: string }` |
|---|---|

```typescript
const result = await iqlabs.reader.readCodeIn('0x5Xg7...');
console.log(result.data);
console.log(result.metadata.typeField); // 'text/plain'
```

---

### Tables

#### `initializeDbRoot(signer, dbRootId)`

Claim a `dbRootId`. Reverts if already initialized.

```typescript
await iqlabs.writer.initializeDbRoot(signer, 'my-db');
```

#### `manageTableCreators(signer, dbRootId, tableCreators, extCreators)`

DbRoot-creator only. Pass empty arrays to open creation to anyone.

```typescript
await iqlabs.writer.manageTableCreators(signer, 'my-db', [admin1, admin2], []);
```

#### `createTable(signer, dbRootId, tableName, columns, idCol, extKeys?, gate?, writers?, isPrivate?)`

```typescript
import { ZeroAddress, parseEther } from 'ethers';

// Public table
await iqlabs.writer.createTable(signer, 'my-db', 'users', ['name', 'email'], 'user_id');

// Private (must know name)
await iqlabs.writer.createTable(
  signer, 'my-db', 'secret_log', ['entry'], 'entry_id', [],
  undefined, [], true
);

// ERC-20 gated (>= 100 tokens, 18 decimals)
await iqlabs.writer.createTable(
  signer, 'my-db', 'vip', ['name'], 'user_id', [],
  { tokenAddress: erc20Address, amount: parseEther('100'), gateType: 0 }
);

// ERC-721 gated (any NFT)
await iqlabs.writer.createTable(
  signer, 'my-db', 'holders', ['name'], 'user_id', [],
  { tokenAddress: nftAddress, amount: 0, gateType: 1 }
);

// Writer-restricted (independent of gate)
await iqlabs.writer.createTable(
  signer, 'my-db', 'staff_only', ['note'], 'note_id', [],
  undefined, [staff1, staff2]
);
```

#### `updateTable(signer, dbRootId, tableName, columns, idCol, extKeys?, gate?, writers?)`

DbRoot-creator only. Existing rows preserved. Same params as `createTable` minus `isPrivate`.

```typescript
await iqlabs.writer.updateTable(
  signer, 'my-db', 'vip', ['name'], 'user_id', [],
  { tokenAddress: erc20Address, amount: parseEther('500'), gateType: 0 }
);
```

#### `writeRow(signer, dbRootId, tableName, rowJson, onProgress?)`

```typescript
await iqlabs.writer.writeRow(signer, 'my-db', 'users', JSON.stringify({
  id: 1, name: 'Alice', email: 'alice@example.com'
}));
```

> Table must exist — `writeRow` reverts if `txChainTail` is missing. Fires `dbCodeIn` (fee charged here) + `updateTableTxChainTail` (free).

#### `readTableRows(dbRootId, tableName, options?)`

| **Returns** | `Array<{ txHash, data }>` (most recent first; `data` is parsed JSON or raw string) |
|---|---|

```typescript
const rows = await iqlabs.reader.readTableRows('my-db', 'users', { limit: 50 });
rows.forEach(r => console.log(r.txHash, r.data));
```

#### `getTablelistFromRoot(dbRootId)`

| **Returns** | `{ creator, tables: TableEntry[], globalTables: TableEntry[], tableCreationFeeOverride: bigint, tableCreationFeeIsSet: boolean }` where `TableEntry = { name, seedHex }` |
|---|---|

`tables` = public only. `globalTables` = public + private.

```typescript
const root = await iqlabs.reader.getTablelistFromRoot('my-db');
root.tables.forEach(t => console.log(`public: ${t.name} (${t.seedHex})`));
```

#### `manageRowData(signer, dbRootId, tableName, rowJson, targetTx)`

Annotate / overwrite a previously written row. Fires `dbInstructionCodeIn` + `updateTableTxChainTail` — both free (gas-only).

```typescript
await iqlabs.writer.manageRowData(
  signer, 'my-db', 'users',
  JSON.stringify({ id: 1, name: 'Updated Name' }),
  originalRowTxHash
);
```

#### Per-root fee pinning

```typescript
// DbRoot creator pins this app's room creation cost
await iqlabs.writer.setRootTableCreationFee(signer, 'my-db', ethers.parseEther('0.001'));

// Or make rooms permanently free
await iqlabs.writer.setRootTableCreationFee(signer, 'my-db', 0n);

// Clear the pin, fall back to global default
await iqlabs.writer.clearRootTableCreationFee(signer, 'my-db');
```

Split is always 31% `feeReceiver` / 69% `DbRoot.creator`, so a 0-fee root simply collects nothing.

#### `transferDbRootCreator(signer, dbRootId, newCreator)`

Hand ownership of a root (and its 69% share) to another address. Caller must be current creator.

```typescript
await iqlabs.writer.transferDbRootCreator(signer, 'my-db', '0xNewOwner...');
```

#### `fetchInventoryTransactions(userAddress, options?)`

Walk a user's `codeIn` history.

```typescript
const myFiles = await iqlabs.reader.fetchInventoryTransactions(myAddress, { limit: 20 });
myFiles.forEach(tx => console.log(`${tx.txHash}: ${tx.handle} (${tx.typeField})`));
```

For inline uploads `tailTx` is empty and `handle` *is* the data. For chunked uploads `handle` is the filename and `tailTx` points to the linked-list tail — use `readCodeIn()` to reconstruct.

---

### Connections

#### `requestConnection(signer, dbRootId, receiver, tableName, columns, idCol, extKeys?)`

Free in this version. Seed is derived from `(sender, receiver)`.

```typescript
await iqlabs.writer.requestConnection(
  signer, 'my-db', friendAddress,
  'dm_table', ['message', 'timestamp'], 'message_id'
);
```

#### `manageConnection(signer, otherParty, dbRootId, newStatus)`

```typescript
await iqlabs.writer.manageConnection(signer, friendAddress, 'my-db', 1); // approve
await iqlabs.writer.manageConnection(signer, friendAddress, 'my-db', 2); // block
```

#### `readConnection(dbRootId, partyA, partyB)`

| **Returns** | `{ status: 'pending' \| 'approved' \| 'blocked' \| 'unknown', requester, blocker }` |
|---|---|

`'unknown'` means no connection record on-chain.

#### `writeConnectionRow(signer, otherParty, dbRootId, rowJson, onProgress?)`

```typescript
await iqlabs.writer.writeConnectionRow(
  signer, friendAddress, 'my-db',
  JSON.stringify({ message_id: '123', message: 'Hello friend!', timestamp: Date.now() })
);
```

#### `readConnectionRows(dbRootId, partyA, partyB, options?)`

| **Returns** | `Array<{ txHash, data }>` (most recent first) |
|---|---|

```typescript
const messages = await iqlabs.reader.readConnectionRows(
  'my-db', myAddress, friendAddress, { limit: 50 }
);
```

#### `fetchUserConnections(userAddress)`

Direct on-chain read (no tx-history scan). Returns `{ connectionKey, partyA, partyB, status }`. To get `dbRootId` / `requester` / `blocker`, call `readConnection()` per pair.

```typescript
const connections = await iqlabs.reader.fetchUserConnections(myAddress);
const friends = connections.filter(c => c.status === 'approved');
```

---

### User profile

#### `updateUserMetadata(signer, metadata)`

Stored as raw bytes (UTF-8 encoded if you pass a string). Overwrites previous value.

```typescript
await iqlabs.writer.updateUserMetadata(signer, JSON.stringify({ name: 'Alice', bio: 'gm' }));
```

#### `readUserState(userAddress)`

| **Returns** | `{ metadata: string \| null, txChainTail: string }` |
|---|---|

---

### Encryption

Same encryption wire format as Solana (X25519 / AES-GCM / PBKDF2), so a ciphertext produced on Solana can be decrypted here with the matching key. The X25519 key itself is derived from a wallet signature, so a Solana keypair and an EVM wallet each produce a different X25519 keypair.

#### `deriveX25519Keypair(signMessage)`

```typescript
import { getBytes } from 'ethers';

// ethers signMessage returns hex — convert to bytes
const sign = async (msg: Uint8Array) => getBytes(await signer.signMessage(msg));
const { privKey, pubKey } = await iqlabs.crypto.deriveX25519Keypair(sign);
```

#### `dhEncrypt` / `dhDecrypt`

```typescript
const enc = await iqlabs.crypto.dhEncrypt(
  recipientPubHex,
  new TextEncoder().encode('secret message')
);
const dec = await iqlabs.crypto.dhDecrypt(myPrivKey, enc.senderPub, enc.iv, enc.ciphertext);
```

#### `passwordEncrypt` / `passwordDecrypt`

```typescript
const enc = await iqlabs.crypto.passwordEncrypt(
  'my-password',
  new TextEncoder().encode('secret data')
);
const dec = await iqlabs.crypto.passwordDecrypt('my-password', enc.salt, enc.iv, enc.ciphertext);
```

#### `multiEncrypt` / `multiDecrypt`

```typescript
const enc = await iqlabs.crypto.multiEncrypt(
  [alicePubHex, bobPubHex, carolPubHex],
  new TextEncoder().encode('group secret')
);
const plaintext = await iqlabs.crypto.multiDecrypt(alicePrivKey, alicePubHex, enc);
```

Duplicate recipients are deduplicated automatically.

---

### Environment

#### `setNetwork(mode, rpcUrl?)`

```typescript
iqlabs.setNetwork('sepolia');          // default RPC
iqlabs.setNetwork('monad', 'https://your-monad-rpc'); // custom RPC
```

#### `getNetwork()` / `getRpcUrl()`

```typescript
console.log(iqlabs.getNetwork()); // 'sepolia'
console.log(iqlabs.getRpcUrl());
```

#### `assertChainMatches(providerOrSigner?)`

Throws if the configured RPC's `chainId` doesn't match the active network. Use defensively when the user controls the RPC.

```typescript
iqlabs.setNetwork('sepolia');
await iqlabs.assertChainMatches(signer); // throws if chainId !== 11155111
```

#### `setRpcUrl(url)` / `getRpcUrl()`

Override only the reader RPC without changing network. Writers use the provider attached to their `Signer`.

---

### Utilities

#### `deriveDmSeed(userA, userB)`

Sorted lowercase + keccak256 — order doesn't matter.

```typescript
const seed1 = iqlabs.utils.deriveDmSeed(walletA, walletB);
const seed2 = iqlabs.utils.deriveDmSeed(walletB, walletA);
// seed1 === seed2
```

#### Fee getters

Live fee values from the contract, cached 10 min. Clear with `iqlabs.utils.clearFeeCache()` after the owner runs `setFees`.

| Function | Returns |
|----------|---------|
| `getBasicFee(signerOrProvider)` | inline code-in fee |
| `getLinkedListFee(signerOrProvider)` | chunked code-in fee |
| `getTableCreationFee(signerOrProvider)` | global default |
| `resolveCodeInFee(signerOrProvider, onChainPath)` | `""` → basicFee else linkedListFee |
| `getEffectiveTableCreationFee(signerOrProvider, dbRootId)` | root override if pinned, else global |

```typescript
const myFee = await iqlabs.utils.resolveCodeInFee(signer, '');
const roomFee = await iqlabs.utils.getEffectiveTableCreationFee(provider, 'my-db');
```

---

## Advanced

### Low-level helpers

- `toChunks(data)` — split into 850-byte chunks
- `uploadLinkedList(signer, chunks, onProgress?)` — upload chunks, return tail tx
- `prepareUpload(signer, data, onProgress?)` — decide inline vs linked-list

### Reader helpers

- `fetchTableMeta(dbRootId, tableName)` — raw table struct
- `readSendCodeChain(tailTx, onProgress?)` — reconstruct a linked-list payload
- `walkCalldataChain(tailTx, beforeArg, options?)` — walk any tx chain backwards
- `isEnd(tx)` — `true` for empty / `"Genesis"` / zero hash

### ABI-only (no SDK wrapper)

`onboardTable` (promote private → public) and `updateDbRootTableList` (replace public list). Call via the contract interface:

```typescript
const c = iqlabs.contract.getContract(signer);
const tx = await c.onboardTable(iqlabs.utils.toSeed('my-db'), 'my-board');
await tx.wait();
```

### `setTableCreationFee(signer, newFee)`

IQ-protocol owner only. Updates the contract-wide default.

```typescript
await iqlabs.writer.setTableCreationFee(signer, ethers.parseEther('0.0005'));
```

---

## Cross-chain notes

- **Tables auto-create on Solana, but not on EVM** — always `initializeDbRoot` + `createTable` before `writeRow`.
- **Same encryption wire format** — a ciphertext encrypted on any chain decrypts on any other with the matching key (X25519 keys are wallet-derived, so Solana vs EVM wallets have different keypairs).
- **Same fee structure on Monad** (amounts differ) — switch with `setNetwork('monad')`. See [`fetch_skill("monad")`](https://iqlabs.dev/skills/monad.md) for Monad-specific fees, testnet faucet, and chain config.
- **Robinhood Chain mainnet** (ETH gas, chain ID 4663) — switch with `setNetwork('robinhood')` (SDK v0.3.0+). See [`fetch_skill("robinhood")`](https://iqlabs.dev/skills/robinhood.md).
- **Solana TS:** `fetch_skill("solana")` or https://iqlabs.dev/skills/solana.md
- **Python (Solana):** `fetch_skill("python")` or https://iqlabs.dev/skills/python.md
