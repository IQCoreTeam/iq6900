---
name: iqlabs-solana
version: 2.0.0
description: IQLabs SDK on Solana — TypeScript reference for on-chain data, IQDB tables, connections, and encryption
---

# IQLabs SDK — Solana (TypeScript)

The default IQLabs SDK. Store any data on-chain, build databases with token/NFT-gated tables, manage friend/DM connections, and encrypt end-to-end. All four primitives written to Solana via your own keypair.

> Full docs: https://iqlabs.mintlify.app/docs-typescript ([LLM-friendly](https://iqlabs.mintlify.app/docs-typescript.md))
> npm: https://www.npmjs.com/package/@iqlabs-official/solana-sdk

## Install

```bash
npm i @iqlabs-official/solana-sdk @solana/web3.js
```

## Wallet / Signer setup

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import fs from 'fs';

const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const keypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync('keypair.json', 'utf8')))
);
```

Override the reader RPC anytime:

```typescript
iqlabs.utils.setRpcUrl('https://your-rpc.example.com');
```

---

## Core concepts

### Data Storage (Code In)

Inscribe any payload as transaction data. The SDK picks the upload mode by size:

- **< 900 bytes** — single inline transaction
- **< 8.5 KB** — multi-tx chunks
- **>= 8.5 KB** — parallel upload

### User State PDA

A per-user profile account. Auto-created the first time you call `codeIn()`; first call may sign twice. Stores profile data and counts uploaded files.

### Connection PDA

A two-party relationship account: `pending`, `approved`, or `blocked`. Only the blocker can unblock.

### Database Tables

JSON tables under a `dbRootId` namespace. Identified by `(dbRootId, tableSeed)`. `tableSeed` is keccak256-hashed for PDA derivation; a human-readable `tableHint` is stored in `DbRoot.table_seeds` for discovery. The DbRoot PDA auto-expands when low on space.

### Token & Collection Gating

Tables can require writers to hold an SPL token or NFT collection.

```typescript
gate?: {
  mint: PublicKey;       // SPL token mint OR Metaplex verified collection
  amount?: number;       // min token amount (default 1; ignored for collections)
  gateType?: GateType;   // GateType.Token (default) or GateType.Collection
}
```

The SDK automatically resolves token / metadata accounts on `writeRow()`.

### Table Creation Permissions

The DbRoot creator controls who can create tables.

| Bucket | Visibility | Permission field |
|--------|-----------|------------------|
| **Public** (`table_seeds`) | Listed in `getTablelistFromRoot()` | `table_creators` |
| **Private** (`global_table_seeds`) | Only accessible if you know the PDA | `ext_creators` |

Empty list = anyone can create.

### Encryption

Three modes, all under `iqlabs.crypto`:

- **DH** — single-recipient X25519 ECDH → HKDF-SHA256 → AES-256-GCM
- **Password** — PBKDF2-SHA256 (250k iterations) → AES-256-GCM
- **Multi-recipient** — PGP-style hybrid: random CEK, wrapped per recipient

Users derive a deterministic X25519 keypair from a wallet signature — no separate keystore.

---

## Function reference

### Data Storage

#### `codeIn(input, data, filename?, method?, filetype?, onProgress?)`

| **Returns** | tx signature (string) |
|---|---|

```typescript
const sig = await iqlabs.writer.codeIn(
  { connection, signer: keypair },
  'Hello, blockchain!',
  'hello.txt'
);
// View at: https://gateway.iqlabs.dev/img/{sig}.png  (for image uploads)
```

#### `readCodeIn(txSignature, speed?, onProgress?)`

| **Returns** | `{ metadata: string, data: string \| null }` |
|---|---|

```typescript
const result = await iqlabs.reader.readCodeIn('5Xg7...');
console.log(result.data);
```

`speed`: `'light' | 'medium' | 'heavy' | 'extreme'`

---

### Tables

#### `writeRow(connection, signer, dbRootId, tableSeed, rowJson, skipConfirmation?, remainingAccounts?)`

First write auto-creates the table.

```typescript
const dbRootId = sha256('my-app');
await iqlabs.writer.writeRow(
  connection, keypair, dbRootId, 'users',
  JSON.stringify({ id: 1, name: 'Alice', email: 'alice@example.com' })
);
```

#### `createTable(connection, signer, dbRootId, tableSeed, tableName, columnNames, idCol, extKeys, gate?, writers?, tableHint?)`

Create explicitly when you need a gate, writer allowlist, or want a readable hint in DbRoot.

```typescript
// Token-gated
await iqlabs.writer.createTable(
  connection, keypair, 'my-db', 'vip', 'vip',
  ['name'], 'user_id', [],
  { mint: tokenMint, amount: 100, gateType: iqlabs.contract.GateType.Token },
  undefined,
  'vip'
);

// NFT collection-gated
await iqlabs.writer.createTable(
  connection, keypair, 'my-db', 'holders', 'holders',
  ['name'], 'user_id', [],
  { mint: collectionPubkey, gateType: iqlabs.contract.GateType.Collection },
  undefined,
  'holders'
);
```

#### `readTableRows(account, options?)`

Walk the table's tx history and return decoded rows.

| **Options** | `limit`, `before` (cursor), `signatures` (pre-collected), `speed` |
|---|---|

```typescript
const programId = iqlabs.contract.PROGRAM_ID;
const dbRootPda = iqlabs.contract.getDbRootPda(dbRootId, programId);
const tablePda = iqlabs.contract.getTablePda(dbRootPda, sha256('users'), programId);

const rows = await iqlabs.reader.readTableRows(tablePda, { limit: 50 });
```

Cursor / windowed paging:

```typescript
const sigs = await iqlabs.reader.collectSignatures(tablePda);          // signatures only, no decode
const idx = sigs.indexOf('abc123');
const slice = sigs.slice(idx - 25, idx + 25);
const rows = await iqlabs.reader.readTableRows(tablePda, { signatures: slice });
```

#### `getTablelistFromRoot(connection, dbRootId)`

| **Returns** | `{ rootPda, creator, tableSeeds: string[], globalTableSeeds: string[] }` (hex hints) |
|---|---|

Decode each hint and derive its PDA:

```typescript
const { tableSeeds } = await iqlabs.reader.getTablelistFromRoot(connection, dbRootId);
for (const seedHex of tableSeeds) {
  const hint = Buffer.from(seedHex, 'hex').toString('utf8');
  const tablePda = iqlabs.contract.getTablePda(
    dbRoot, iqlabs.utils.toSeedBytes(hint), programId
  );
}
```

#### `manageRowData(connection, signer, dbRootId, seed, rowJson, tableName?, targetTx?)`

Update an existing row. Works for both table rows and connection rows.

```typescript
await iqlabs.writer.manageRowData(
  connection, keypair, 'my-db', 'users',
  JSON.stringify({ id: 1, name: 'Updated Name' }),
  'users',
  originalTxSig
);
```

#### Table-creator permissions

```typescript
const ix = iqlabs.contract.manageTableCreatorsInstruction(
  builder,
  { signer: wallet.publicKey, db_root: dbRootPda, system_program: SystemProgram.programId },
  {
    db_root_id: dbRootIdBytes,
    table_creators: [adminWallet1, adminWallet2], // public-table creators
    ext_creators: [],                              // empty = anyone for private
  }
);
```

Promote a private table to public (caller must be in `table_creators`):

```typescript
const ix = iqlabs.contract.onboardTableInstruction(
  builder,
  { signer: wallet.publicKey, db_root: dbRootPda },
  { db_root_id: dbRootIdBytes, table_seed: Buffer.from('my-board') }
);
```

---

### Connections

#### `requestConnection(connection, signer, dbRootId, partyA, partyB, tableName, columns, idCol, extKeys)`

```typescript
await iqlabs.writer.requestConnection(
  connection, keypair, 'my-db',
  myWallet, friendWallet,
  'dm_table', ['message', 'timestamp'], 'message_id', []
);
```

#### `manageConnection` (contract-level — no high-level wrapper)

```typescript
const builder = iqlabs.contract.createInstructionBuilder();

const approveIx = iqlabs.contract.manageConnectionInstruction(
  builder,
  { db_root, connection_table, signer: myPubkey },
  { db_root_id, connection_seed, new_status: iqlabs.contract.CONNECTION_STATUS_APPROVED }
);

const blockIx = iqlabs.contract.manageConnectionInstruction(
  builder,
  { db_root, connection_table, signer: myPubkey },
  { db_root_id, connection_seed, new_status: iqlabs.contract.CONNECTION_STATUS_BLOCKED }
);
```

#### `readConnection(dbRootId, partyA, partyB)`

| **Returns** | `{ status: 'pending' \| 'approved' \| 'blocked' \| 'unknown', requester: 'a' \| 'b', blocker: 'a' \| 'b' \| 'none' }` |
|---|---|

#### `writeConnectionRow(connection, signer, dbRootId, connectionSeed, rowJson)`

```typescript
const seed = iqlabs.utils.deriveDmSeed(myWallet, friendWallet);
await iqlabs.writer.writeConnectionRow(
  connection, keypair, 'my-db', seed,
  JSON.stringify({ id: nanoid(), content: 'Hey!', timestamp: new Date().toISOString() })
);
```

#### `fetchUserConnections(userPubkey, options?)`

| **Options** | `limit`, `before`, `speed` |
|---|---|
| **Returns** | array of `{ dbRootId, connectionPda, partyA, partyB, status, requester, blocker, timestamp }` |

```typescript
const connections = await iqlabs.reader.fetchUserConnections(myPubkey, { speed: 'light', limit: 100 });
const pending = connections.filter(c => c.status === 'pending');
const friends = connections.filter(c => c.status === 'approved');
```

---

### User profile

#### `updateUserMetadata(connection, signer, dbRootId, meta)`

```typescript
await iqlabs.writer.updateUserMetadata(connection, keypair, 'my-db', metaTxSignature);
```

#### `readUserState(userPubkey)`

| **Returns** | `{ owner, metadata, totalSessionFiles, profileData? }` |
|---|---|

---

### Encryption

#### `deriveX25519Keypair(signMessage)`

```typescript
const { privKey, pubKey } = await iqlabs.crypto.deriveX25519Keypair(wallet.signMessage);
```

#### `dhEncrypt(recipientPubHex, plaintext)` / `dhDecrypt(privKey, senderPubHex, ivHex, ciphertextHex)`

```typescript
const enc = await iqlabs.crypto.dhEncrypt(
  recipientPubHex,
  new TextEncoder().encode('secret message')
);

const dec = await iqlabs.crypto.dhDecrypt(myPrivKey, enc.senderPub, enc.iv, enc.ciphertext);
console.log(new TextDecoder().decode(dec));
```

#### `passwordEncrypt(password, plaintext)` / `passwordDecrypt(password, saltHex, ivHex, ciphertextHex)`

```typescript
const enc = await iqlabs.crypto.passwordEncrypt('my-password', new TextEncoder().encode('secret'));
const dec = await iqlabs.crypto.passwordDecrypt('my-password', enc.salt, enc.iv, enc.ciphertext);
```

#### `multiEncrypt(recipientPubHexes, plaintext)` / `multiDecrypt(privKey, pubKeyHex, encrypted)`

```typescript
const enc = await iqlabs.crypto.multiEncrypt(
  [alicePubHex, bobPubHex, carolPubHex],
  new TextEncoder().encode('group secret')
);

const plaintext = await iqlabs.crypto.multiDecrypt(alicePrivKey, alicePubHex, enc);
```

---

### Utilities

#### `deriveDmSeed(userA, userB)`

Sorted-keccak256 — order doesn't matter.

```typescript
const seed1 = iqlabs.utils.deriveDmSeed(walletA, walletB);
const seed2 = iqlabs.utils.deriveDmSeed(walletB, walletA);
// seed1 === seed2
```

#### `toSeedBytes(value)`

64-char hex → hex bytes; otherwise keccak256.

```typescript
const seedBytes = iqlabs.utils.toSeedBytes('my-custom-seed');
const [pda, bump] = PublicKey.findProgramAddressSync([seedBytes, otherSeed], programId);
```

#### Seeds & PDA derivation

```typescript
import { createHash } from 'crypto';

const sha256 = (s: string): Buffer => createHash('sha256').update(s).digest();
const dbRootId = sha256('my-app');
const tableSeed = sha256('users');

const programId = iqlabs.contract.PROGRAM_ID;
const dbRootPda = iqlabs.contract.getDbRootPda(dbRootId, programId);
const tablePda = iqlabs.contract.getTablePda(dbRootPda, tableSeed, programId);
```

---

## Cross-chain notes

The Solana SDK auto-creates tables on first `writeRow()`. The Ethereum / Monad SDKs require explicit `initializeDbRoot()` + `createTable()` first. The encryption wire format (X25519 / AES-GCM / PBKDF2) is identical across chains, so a ciphertext produced by one SDK can be decrypted by another with the matching key — note that the X25519 key is derived from a wallet *signature*, so Solana and EVM wallets each produce their own keypair.

- Ethereum (Sepolia): `fetch_skill("ethereum")` or https://iqlabs.dev/skills/ethereum.md
- Monad: `fetch_skill("monad")` or https://iqlabs.dev/skills/monad.md
- Python (Solana): `fetch_skill("python")` or https://iqlabs.dev/skills/python.md
