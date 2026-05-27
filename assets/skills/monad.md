---
name: iqlabs-monad
version: 2.0.0
description: IQLabs SDK on Monad — TypeScript reference for on-chain data, IQDB tables, connections, and encryption (mainnet + testnet)
---

# IQLabs SDK — Monad

The IQLabs Ethereum SDK works on Monad out of the box. Same API, one line to switch networks. Monad is fast and cheap, so everything just works better.

> Full docs: https://iqlabs.mintlify.app/docs-monad
> npm: `@iqlabs-official/ethereum-sdk` (same package as Ethereum)

> **Monad mainnet and testnet are both live.** New to Monad? Start on testnet with free MON — see [Testnet](#testnet).

## Install

```bash
npm i @iqlabs-official/ethereum-sdk
```

---

## Network

| Mode | Chain ID | Currency | Contract | Default RPC |
|------|---------:|----------|----------|-------------|
| `sepolia` | 11155111 | ETH | [`0xB1C16271954c7238672c3666FD22Ee14C6d065Db`](https://sepolia.etherscan.io/address/0xB1C16271954c7238672c3666FD22Ee14C6d065Db) | `https://ethereum-sepolia-rpc.publicnode.com` |
| `monad` | 143 | MON | [`0xeFd9376835076Bf8d83826F6A2277BB5362Cd893`](https://monadvision.com/address/0xeFd9376835076Bf8d83826F6A2277BB5362Cd893) | `https://rpc.monad.xyz` |
| `monadTestnet` | 10143 | MON | [`0x88af59e58C7E5DcbE7cc12972B90cff3fEEF7223`](https://testnet.monadexplorer.com/address/0x88af59e58C7E5DcbE7cc12972B90cff3fEEF7223) | `https://testnet-rpc.monad.xyz` |

```typescript
import iqlabs from '@iqlabs-official/ethereum-sdk';

iqlabs.setNetwork('monad');        // mainnet
// or
iqlabs.setNetwork('monadTestnet'); // testnet (free MON)
```

The contract is identical across all three networks (same ABI, same functions). Only the address, chain, and fees differ. The SDK reads fees on-chain — you never hardcode them.

---

## Testnet

Develop and test for free on **Monad testnet** before touching mainnet. The contract is deployed and verified there with the same surface as mainnet, so testnet is an exact rehearsal.

### 1. Get free testnet MON

1. Go to [faucet.monad.xyz](https://faucet.monad.xyz/)
2. Paste your wallet address
3. Request — arrives in seconds

> The faucet hands out ~20 MON per request (with about 25 MON extra for connected social). Testnet fees are 1/10 of mainnet (`basicFee` 0.65 MON, `linkedListFee` 1.95 MON, `tableCreationFee` 1.95 MON), so one faucet claim is plenty.

> Testnet MON has **no real value** and only works on chain ID `10143`. Never send it to a mainnet address.

### 2. Point the SDK at testnet

```typescript
iqlabs.setNetwork('monadTestnet');
```

That's the only change. Every reader/writer call now targets the testnet deployment.

### 3. Wallet setup (testnet)

Node.js:

```typescript
import { Wallet, JsonRpcProvider } from 'ethers';

const provider = new JsonRpcProvider('https://testnet-rpc.monad.xyz');
const signer = new Wallet(process.env.PRIVATE_KEY!, provider);
```

MetaMask:

| Field | Value |
|-------|-------|
| Network Name | Monad Testnet |
| RPC URL | `https://testnet-rpc.monad.xyz` |
| Chain ID | `10143` |
| Currency Symbol | `MON` |
| Block Explorer | `https://testnet.monadexplorer.com` |

> Use `assertChainMatches(signer)` after `setNetwork('monadTestnet')` to catch a signer still pointed at the wrong chain.

### 4. Going to mainnet

```typescript
iqlabs.setNetwork('monad'); // mainnet uses real MON
```

No other code changes. Note: `dbRootId`s and table names are **separate** on mainnet (different chain state) — re-create them there.

---

## Wallet / Signer setup (mainnet)

Node.js:

```typescript
import { Wallet, JsonRpcProvider } from 'ethers';

const provider = new JsonRpcProvider('https://rpc.monad.xyz');
const signer = new Wallet(process.env.PRIVATE_KEY!, provider);
```

MetaMask (mainnet):

| Field | Value |
|-------|-------|
| Network Name | Monad |
| RPC URL | `https://rpc.monad.xyz` |
| Chain ID | `143` |
| Currency Symbol | `MON` |

```typescript
import { BrowserProvider } from 'ethers';

const provider = new BrowserProvider(window.ethereum);
await provider.send('eth_requestAccounts', []);
const signer = await provider.getSigner();
```

---

## Core concepts

The contract is byte-for-byte identical to the Ethereum deployment, so the four primitives behave exactly the same: **Code In**, **IQDB Tables**, **Connections**, and **Encryption**. See [`fetch_skill("ethereum")`](https://iqlabs.dev/skills/ethereum.md) for the full conceptual walkthrough.

Monad-specific differences are limited to:

- Currency is **MON** (not ETH)
- Fee values (see below)
- Free testnet faucet — see [Testnet](#testnet)

### Fees

| Fee | Mainnet | Testnet | Charged on |
|-----|---------|---------|------------|
| `basicFee` | 6.5 MON | 0.65 MON | inline `codeIn` / `writeRow` / `writeConnectionRow` |
| `linkedListFee` | 19.5 MON | 1.95 MON | the same when payload is chunked |
| `tableCreationFee` | 19.5 MON | 1.95 MON | `createTable` (split 31% feeReceiver / 69% DbRoot creator) |
| `discountFee` | 3.25 MON | 0.325 MON | replaces `basicFee` on inline path for IQ-token holders |

Testnet fees are exactly 10× cheaper because the faucet drips only modest amounts — full mainnet pricing would make a round trip unreachable for devs.

Free (gas-only): `updateTableTxChainTail`, `updateConnectionTxChainTail`, `updateUserTxChainTail`, `requestConnection`, `manageConnection`, `dbInstructionCodeIn`.

---

## Function reference

The API surface is identical to the Ethereum SDK — every function below works the same way on Monad. The examples below show the Monad-flavored call pattern (always call `setNetwork('monad')` or `setNetwork('monadTestnet')` first).

### Data Storage

#### `codeIn(signer, data, filename?, filetype?, onProgress?)`

```typescript
iqlabs.setNetwork('monad');

const txHash = await iqlabs.writer.codeIn(signer, 'Hello Monad!');

const txHash2 = await iqlabs.writer.codeIn(
  signer, longString, 'data.txt', 'text/plain',
  (pct) => console.log(`upload: ${pct.toFixed(1)}%`)
);
```

#### `readCodeIn(txHash, onProgress?)`

```typescript
const result = await iqlabs.reader.readCodeIn(txHash);
console.log(result.data, result.metadata.typeField);
```

---

### Tables

> Unlike Solana, tables must be initialized explicitly: `initializeDbRoot` → `createTable` → `writeRow`.

#### `initializeDbRoot(signer, dbRootId)`

```typescript
await iqlabs.writer.initializeDbRoot(signer, 'my-app');
```

#### `manageTableCreators(signer, dbRootId, tableCreators, extCreators)`

```typescript
await iqlabs.writer.manageTableCreators(signer, 'my-app', [admin1, admin2], []);
```

#### `createTable(signer, dbRootId, tableName, columns, idCol, extKeys?, gate?, writers?, isPrivate?)`

```typescript
import { parseEther } from 'ethers';

// Public table
await iqlabs.writer.createTable(
  signer, 'my-app', 'posts', ['title', 'body', 'author'], 'post_id'
);

// ERC-20 gated (>= 100 tokens)
await iqlabs.writer.createTable(
  signer, 'my-app', 'vip', ['name'], 'user_id', [],
  { tokenAddress: erc20Address, amount: parseEther('100'), gateType: 0 }
);

// ERC-721 gated
await iqlabs.writer.createTable(
  signer, 'my-app', 'holders', ['name'], 'user_id', [],
  { tokenAddress: nftAddress, amount: 0, gateType: 1 }
);

// Private
await iqlabs.writer.createTable(
  signer, 'my-app', 'internal', ['note'], 'note_id', [],
  undefined, [], true
);
```

#### `updateTable(...)`

Same args as `createTable` minus `isPrivate`. DbRoot-creator only. Existing rows preserved.

```typescript
await iqlabs.writer.updateTable(
  signer, 'my-app', 'vip', ['name'], 'user_id', [],
  { tokenAddress: erc20Address, amount: parseEther('500'), gateType: 0 }
);
```

#### `writeRow(signer, dbRootId, tableName, rowJson, onProgress?)`

```typescript
await iqlabs.writer.writeRow(signer, 'my-app', 'posts', JSON.stringify({
  post_id: '1',
  title: 'gm Monad',
  body: 'first post on-chain',
  author: await signer.getAddress()
}));
```

#### `readTableRows(dbRootId, tableName, options?)`

```typescript
const rows = await iqlabs.reader.readTableRows('my-app', 'posts', { limit: 50 });
rows.forEach(r => console.log(r.data));
```

#### `getTablelistFromRoot(dbRootId)`

```typescript
const { creator, tables, globalTables } = await iqlabs.reader.getTablelistFromRoot('my-app');
tables.forEach(t => console.log(`${t.name} (${t.seedHex})`));
```

#### `fetchInventoryTransactions(userAddress, options?)`

```typescript
const myFiles = await iqlabs.reader.fetchInventoryTransactions(myAddress, { limit: 20 });
myFiles.forEach(tx => console.log(`${tx.txHash}: ${tx.handle}`));
```

---

### Connections

#### `requestConnection(signer, dbRootId, receiver, tableName, columns, idCol, extKeys?)`

Free (gas only).

```typescript
await iqlabs.writer.requestConnection(
  signer, 'my-app', friendAddress,
  'dm_table', ['message', 'timestamp'], 'message_id'
);
```

#### `manageConnection(signer, otherParty, dbRootId, newStatus)`

```typescript
await iqlabs.writer.manageConnection(signer, friendAddress, 'my-app', 1); // approve
await iqlabs.writer.manageConnection(signer, friendAddress, 'my-app', 2); // block
```

#### `readConnection(dbRootId, partyA, partyB)`

```typescript
const { status } = await iqlabs.reader.readConnection('my-app', addressA, addressB);
```

#### `writeConnectionRow(signer, otherParty, dbRootId, rowJson, onProgress?)`

```typescript
await iqlabs.writer.writeConnectionRow(
  signer, friendAddress, 'my-app',
  JSON.stringify({ message_id: '1', message: 'gm from Monad', timestamp: Date.now() })
);
```

#### `readConnectionRows(dbRootId, partyA, partyB, options?)`

```typescript
const messages = await iqlabs.reader.readConnectionRows(
  'my-app', myAddress, friendAddress, { limit: 50 }
);
```

#### `fetchUserConnections(userAddress)`

```typescript
const connections = await iqlabs.reader.fetchUserConnections(myAddress);
const friends = connections.filter(c => c.status === 'approved');
```

---

### User profile

#### `updateUserMetadata(signer, metadata)`

```typescript
await iqlabs.writer.updateUserMetadata(
  signer, JSON.stringify({ name: 'Alice', bio: 'building on Monad' })
);
```

---

### Encryption

Identical primitives to Solana and Ethereum — same plaintext format, cross-chain compatible.

```typescript
import { getBytes } from 'ethers';

const sign = async (msg: Uint8Array) => getBytes(await signer.signMessage(msg));
const { privKey, pubKey } = await iqlabs.crypto.deriveX25519Keypair(sign);

// Single-recipient
const enc = await iqlabs.crypto.dhEncrypt(
  recipientPubHex, new TextEncoder().encode('secret message')
);
const dec = await iqlabs.crypto.dhDecrypt(myPrivKey, enc.senderPub, enc.iv, enc.ciphertext);

// Password-based
const penc = await iqlabs.crypto.passwordEncrypt('my-password', new TextEncoder().encode('secret data'));
const pdec = await iqlabs.crypto.passwordDecrypt('my-password', penc.salt, penc.iv, penc.ciphertext);

// Multi-recipient
const menc = await iqlabs.crypto.multiEncrypt(
  [alicePubHex, bobPubHex, carolPubHex], new TextEncoder().encode('group secret')
);
const mplaintext = await iqlabs.crypto.multiDecrypt(alicePrivKey, alicePubHex, menc);
```

---

### Environment

#### `setNetwork(mode, rpcUrl?)`

```typescript
iqlabs.setNetwork('monad');
iqlabs.setNetwork('monad', 'https://your-monad-rpc'); // custom RPC
iqlabs.setNetwork('monadTestnet');
```

#### `getNetwork()` / `assertChainMatches(providerOrSigner?)`

```typescript
console.log(iqlabs.getNetwork()); // 'monad'
await iqlabs.assertChainMatches(signer); // throws if signer's chainId doesn't match
```

---

## Tutorial: On-Chain Fortune Cookies 🥠

Build a permanent on-chain fortune cookie machine on Monad. Anyone can submit a fortune. Anyone can draw a random one. All fortunes live on-chain forever.

**What this teaches:** `initializeDbRoot` → `createTable` → `writeRow` → `readTableRows`

```bash
npm i @iqlabs-official/ethereum-sdk ethers
```

```typescript
import iqlabs from '@iqlabs-official/ethereum-sdk';
import { BrowserProvider } from 'ethers';

const DB = 'fortune-cookies';
const TABLE = 'fortunes';

// Call once — only the first caller becomes creator
async function setupFortuneJar(signer: any) {
  iqlabs.setNetwork('monad');
  try {
    await iqlabs.writer.initializeDbRoot(signer, DB);
    await iqlabs.writer.createTable(
      signer, DB, TABLE, ['fortune', 'author', 'ts'], 'id'
    );
    console.log('Fortune jar created on Monad!');
  } catch (e) {
    console.log('Jar already exists, skipping setup');
  }
}

// Submit a fortune (costs 19.5 MON mainnet / 1.95 MON testnet)
async function submitFortune(signer: any, fortune: string) {
  iqlabs.setNetwork('monad');
  const author = await signer.getAddress();
  return iqlabs.writer.writeRow(signer, DB, TABLE, JSON.stringify({
    id: `${author}-${Date.now()}`,
    fortune, author, ts: Date.now()
  }));
}

// Draw a random fortune (free read)
async function drawFortune() {
  iqlabs.setNetwork('monad');
  const rows = await iqlabs.reader.readTableRows(DB, TABLE);
  if (rows.length === 0) return 'The jar is empty. Be the first to add a fortune!';
  return rows[Math.floor(Math.random() * rows.length)].data.fortune;
}

async function main() {
  const provider = new BrowserProvider(window.ethereum);
  await provider.send('eth_requestAccounts', []);
  const signer = await provider.getSigner();

  await setupFortuneJar(signer);
  await submitFortune(signer, 'The best time to build on Monad was yesterday. The second best time is now.');
  console.log('Your fortune:', await drawFortune());
}
```

### How to extend

- **NFT gate**: only holders of a specific collection can submit fortunes
- **Encrypted fortunes**: use `passwordEncrypt` so only readers with the password see the message
- **User profiles**: call `updateUserMetadata` so each author has a name + avatar
- **Reactions**: use `manageRowData` to annotate fortunes with likes

---

## Cross-chain notes

- **Same package as Ethereum** (`@iqlabs-official/ethereum-sdk`) — `setNetwork('monad')` is the only switch
- **Same plaintext format** as Solana — encrypted data round-trips
- **Same EVM rule** — `initializeDbRoot` + `createTable` are required before `writeRow`
- **Ethereum (Sepolia):** `fetch_skill("ethereum")` or https://iqlabs.dev/skills/ethereum.md
- **Solana TS:** `fetch_skill("solana")` or https://iqlabs.dev/skills/solana.md
- **Python (Solana):** `fetch_skill("python")` or https://iqlabs.dev/skills/python.md
