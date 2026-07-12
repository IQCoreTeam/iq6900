---
name: iqlabs-robinhood
version: 2.1.0
description: IQLabs SDK on Robinhood Chain — TypeScript reference for on-chain data, IQDB tables, connections, and encryption (mainnet)
---

# IQLabs SDK — Robinhood Chain

The IQLabs Ethereum SDK works on Robinhood Chain out of the box. Same API, one line to switch networks. Robinhood Chain is an Ethereum-compatible Layer 2 with ETH as the gas token, so fees stay a fraction of a cent while everything behaves exactly like Ethereum.

> Full docs: https://iqlabs.mintlify.app/docs-robinhood
> npm: `@iqlabs-official/ethereum-sdk` **v0.3.0+** (same package as Ethereum / Monad)

> **Robinhood Chain mainnet is live.** The Robinhood Chain testnet contract is not deployed yet — develop against Sepolia or Monad testnet first if you need free rehearsal.

## Install

```bash
npm i @iqlabs-official/ethereum-sdk
```

---

## Network

| Mode | Chain ID | Currency | Contract | Default RPC |
|------|---------:|----------|----------|-------------|
| `sepolia` | 11155111 | ETH | [`0x246A08D9fdD9b3990A88eD1f2DF1A87239839F07`](https://sepolia.etherscan.io/address/0x246A08D9fdD9b3990A88eD1f2DF1A87239839F07) | `https://ethereum-sepolia-rpc.publicnode.com` |
| `monad` | 143 | MON | [`0x7ae06f87Cf93606DA2BD6A281afB28028cAE233D`](https://monadvision.com/address/0x7ae06f87Cf93606DA2BD6A281afB28028cAE233D) | `https://rpc.monad.xyz` |
| `robinhood` | 4663 | ETH | [`0x88af59e58C7E5DcbE7cc12972B90cff3fEEF7223`](https://robinhoodchain.blockscout.com/address/0x88af59e58C7E5DcbE7cc12972B90cff3fEEF7223) | `https://rpc.mainnet.chain.robinhood.com` |

```typescript
import iqlabs from '@iqlabs-official/ethereum-sdk';

iqlabs.setNetwork('robinhood'); // call once at app startup
```

The contract is identical across all networks (same ABI, same functions). Only the address, chain, and fees differ. The SDK reads fees on-chain — you never hardcode them. The Robinhood deployment is [verified on Blockscout](https://robinhoodchain.blockscout.com/address/0x88af59e58C7E5DcbE7cc12972B90cff3fEEF7223#code).

---

## Getting ETH on Robinhood Chain

Robinhood Chain uses **ETH** for gas and fees. Bridge ETH (or supported ERC-20s) in via the canonical Arbitrum bridge or partner routes — see the [official Robinhood Chain docs](https://docs.robinhood.com/chain/) for current options.

> Fees are tiny: a basic write costs `0.00012 ETH` (about $0.22). Bridging a few dollars of ETH is enough for many writes.

> Robinhood Chain is chain ID `4663`. It is a **separate network** from Ethereum mainnet and Arbitrum One — ETH must be bridged in before it can be spent there.

---

## Wallet / Signer setup

Node.js:

```typescript
import { Wallet, JsonRpcProvider } from 'ethers';

const provider = new JsonRpcProvider('https://rpc.mainnet.chain.robinhood.com');
const signer = new Wallet(process.env.PRIVATE_KEY!, provider);
```

MetaMask:

| Field | Value |
|-------|-------|
| Network Name | Robinhood Chain |
| RPC URL | `https://rpc.mainnet.chain.robinhood.com` |
| Chain ID | `4663` |
| Currency Symbol | `ETH` |
| Block Explorer | `https://robinhoodchain.blockscout.com` |

```typescript
import { BrowserProvider } from 'ethers';

const provider = new BrowserProvider(window.ethereum);
await provider.send('eth_requestAccounts', []);
const signer = await provider.getSigner();
```

> Use `assertChainMatches(signer)` after `setNetwork('robinhood')` to catch a signer still pointed at the wrong chain before you send a transaction.

---

## Core concepts

The contract has the same ABI and same functions as the Ethereum and Monad deployments, so the four primitives behave the same way: **Code In**, **IQDB Tables**, **Connections**, and **Encryption**. See [`fetch_skill("ethereum")`](https://iqlabs.dev/skills/ethereum.md) for the full conceptual walkthrough.

Robinhood-specific differences are limited to:

- Gas token and fees are in **ETH** (bridged in — see above)
- Fee values (see below)
- Mainnet only for now — no testnet deployment yet

### Fees

| Fee | Mainnet | ~USD | Charged on |
|-----|---------|------|------------|
| `basicFee` | 0.00012 ETH | ~$0.22 | inline `codeIn` / `writeRow` / `writeConnectionRow` |
| `linkedListFee` | 0.00036 ETH | ~$0.65 | the same when payload is chunked |
| `tableCreationFee` | 0.00036 ETH | ~$0.65 | `createTable` (split 31% feeReceiver / 69% DbRoot creator) |
| `discountFee` | 0.00006 ETH | ~$0.11 | replaces `basicFee` on inline path for IQ-token holders |

Defaults target the same dollar values as Monad mainnet (priced at ETH ~$1,795, July 2026) and are retunable on-chain as price moves — the SDK always reads live values.

Free (gas-only): `updateTableTxChainTail`, `updateConnectionTxChainTail`, `updateUserTxChainTail`, `requestConnection`, `manageConnection`, `dbInstructionCodeIn`.

---

## Function reference

The API surface is identical to the Ethereum SDK — every function below works the same way on Robinhood Chain. Always call `setNetwork('robinhood')` first.

### Data Storage

#### `codeIn(signer, data, filename?, filetype?, onProgress?)`

```typescript
iqlabs.setNetwork('robinhood');

const txHash = await iqlabs.writer.codeIn(signer, 'Hello Robinhood Chain!');

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
  title: 'gm Robinhood Chain',
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
  JSON.stringify({ message_id: '1', message: 'gm from Robinhood Chain', timestamp: Date.now() })
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
  signer, JSON.stringify({ name: 'Alice', bio: 'building on Robinhood Chain' })
);
```

---

### Encryption

Same encryption wire format as Solana, Ethereum, and Monad (X25519 / AES-GCM / PBKDF2). A ciphertext encrypted on any chain decrypts on any other with the matching key. The X25519 key is wallet-signature-derived, so Solana and EVM wallets each produce their own keypair.

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
iqlabs.setNetwork('robinhood');
iqlabs.setNetwork('robinhood', 'https://your-robinhood-rpc'); // custom RPC (e.g. QuickNode)
```

#### `getNetwork()` / `assertChainMatches(providerOrSigner?)`

```typescript
console.log(iqlabs.getNetwork()); // 'robinhood'
await iqlabs.assertChainMatches(signer); // throws if signer's chainId isn't 4663
```

---

## Tutorial: On-Chain Fortune Cookies 🥠

Build a permanent on-chain fortune cookie machine on Robinhood Chain. Anyone can submit a fortune. Anyone can draw a random one. All fortunes live on-chain forever.

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
  iqlabs.setNetwork('robinhood');
  try {
    await iqlabs.writer.initializeDbRoot(signer, DB);
    await iqlabs.writer.createTable(
      signer, DB, TABLE, ['fortune', 'author', 'ts'], 'id'
    );
    console.log('Fortune jar created on Robinhood Chain!');
  } catch (e) {
    console.log('Jar already exists, skipping setup');
  }
}

// Submit a fortune (costs 0.00036 ETH)
async function submitFortune(signer: any, fortune: string) {
  iqlabs.setNetwork('robinhood');
  const author = await signer.getAddress();
  return iqlabs.writer.writeRow(signer, DB, TABLE, JSON.stringify({
    id: `${author}-${Date.now()}`,
    fortune, author, ts: Date.now()
  }));
}

// Draw a random fortune (free read)
async function drawFortune() {
  iqlabs.setNetwork('robinhood');
  const rows = await iqlabs.reader.readTableRows(DB, TABLE);
  if (rows.length === 0) return 'The jar is empty. Be the first to add a fortune!';
  return rows[Math.floor(Math.random() * rows.length)].data.fortune;
}

async function main() {
  const provider = new BrowserProvider(window.ethereum);
  await provider.send('eth_requestAccounts', []);
  const signer = await provider.getSigner();

  await setupFortuneJar(signer);
  await submitFortune(signer, 'The best time to build on Robinhood Chain was yesterday. The second best time is now.');
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

- **Same package as Ethereum / Monad** (`@iqlabs-official/ethereum-sdk` v0.3.0+) — `setNetwork('robinhood')` is the only switch
- **Same encryption wire format** as Solana — ciphertexts decrypt cross-chain with the matching key (X25519 keys are wallet-derived, so Solana vs EVM wallets have different keypairs)
- **Same EVM rule** — `initializeDbRoot` + `createTable` are required before `writeRow`
- **Ethereum (Sepolia):** `fetch_skill("ethereum")` or https://iqlabs.dev/skills/ethereum.md
- **Monad:** `fetch_skill("monad")` or https://iqlabs.dev/skills/monad.md
- **Solana TS:** `fetch_skill("solana")` or https://iqlabs.dev/skills/solana.md
