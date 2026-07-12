---
name: iqlabs-sdk
version: 2.1.0
description: IQLabs SDK — on-chain data, IQDB tables, friend connections, and end-to-end encryption across Solana, Ethereum (Sepolia), Monad, and Robinhood Chain
metadata: {"openclaw":{"emoji":"🦞","category":"sdk"}}
---

# IQLabs SDK Skill

The **complete Web3** SDK — store any data on-chain (files, JSON, messages), build databases with tables, manage friend/DM connections, and encrypt end-to-end. One API, multiple chains, **2000x cheaper** than traditional methods.

> Default chain is **Solana**. Same primitives are mirrored on **Ethereum (Sepolia)**, **Monad** (mainnet + testnet), and **Robinhood Chain** (mainnet).

---

## What is IQLabs SDK?

A single SDK that gives every chain the same four primitives:

| Primitive | What it does |
|-----------|--------------|
| **Code In** | Store arbitrary data (files, text, JSON) directly on-chain. SDK chunks large data automatically. |
| **IQDB Tables** | Structured JSON tables under a `dbRootId` namespace. Token/NFT-gated writes supported. |
| **Connections** | Pending / approved / blocked friend states + private DM rows between two wallets. |
| **Crypto** | X25519 ECDH, password-based, and multi-recipient encryption. Wallet *is* the key. |

The encryption primitives are identical across chains (same X25519 / AES-GCM / PBKDF2 wire format), so a ciphertext encrypted on one chain can be decrypted on another with the matching key.

---

## Pick your chain

| Chain | Skill | When to use |
|-------|-------|-------------|
| **Solana** (default) | [`fetch_skill("solana")`](https://iqlabs.dev/skills/solana.md) | Default. TypeScript SDK on Solana mainnet. |
| **Ethereum (Sepolia)** | [`fetch_skill("ethereum")`](https://iqlabs.dev/skills/ethereum.md) | EVM testnet. Sepolia only — mainnet ETH not deployed yet. |
| **Monad** | [`fetch_skill("monad")`](https://iqlabs.dev/skills/monad.md) | Monad mainnet + testnet. Fast EVM, cheap fees, free testnet faucet. |
| **Robinhood Chain** | [`fetch_skill("robinhood")`](https://iqlabs.dev/skills/robinhood.md) | Robinhood Chain mainnet (chain ID 4663). Ethereum-compatible L2, gas in ETH, sub-cent gas. |
| **Python (Solana)** | [`fetch_skill("python")`](https://iqlabs.dev/skills/python.md) | Same primitives, Python instead of TypeScript. Solana only. |

Fetch a chain's docs with `curl https://iqlabs.dev/skills/<chain>.md` or via the `fetch_skill` tool if your runtime exposes it.

---

## Quick Start (Solana, default)

```bash
npm i @iqlabs-official/solana-sdk @solana/web3.js
```

```typescript
import iqlabs from '@iqlabs-official/solana-sdk';
import { Connection, Keypair } from '@solana/web3.js';
import { createHash } from 'crypto';
import fs from 'fs';

const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const keypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync('keypair.json', 'utf8')))
);

const sha256 = (s: string) => createHash('sha256').update(s).digest();
const dbRootId = sha256('my-app');

// 1. Store data on-chain
const txId = await iqlabs.writer.codeIn(
  { connection, signer: keypair },
  'Hello, on-chain world!',
  'hello.txt'
);

// 2. Read it back
const { data } = await iqlabs.reader.readCodeIn(txId);
console.log(data); // 'Hello, on-chain world!'

// 3. Write a row to a database table
await iqlabs.writer.writeRow(
  connection, keypair, dbRootId, 'users',
  JSON.stringify({ id: 1, name: 'Alice', bio: 'gm' })
);

// 4. Read rows back
const programId = iqlabs.contract.PROGRAM_ID;
const dbRootPda = iqlabs.contract.getDbRootPda(dbRootId, programId);
const tablePda = iqlabs.contract.getTablePda(dbRootPda, sha256('users'), programId);
const rows = await iqlabs.reader.readTableRows(tablePda, { limit: 50 });
```

For the full TypeScript Solana API (connections, encryption, gating, etc.), see [`fetch_skill("solana")`](https://iqlabs.dev/skills/solana.md).

---

## Same code, different chain

The Ethereum / Monad SDKs share the same surface — only the package and signer shape change:

```typescript
import iqlabs from '@iqlabs-official/ethereum-sdk';
import { Wallet, JsonRpcProvider } from 'ethers';

iqlabs.setNetwork('monad'); // or 'sepolia' / 'monadTestnet' / 'robinhood'
const signer = new Wallet(process.env.PRIVATE_KEY!, new JsonRpcProvider('https://rpc.monad.xyz'));

// Tables must be initialized once on EVM (Solana auto-creates)
await iqlabs.writer.initializeDbRoot(signer, 'my-app');
await iqlabs.writer.createTable(signer, 'my-app', 'users', ['name', 'bio'], 'id');

// From here, the row write looks the same
await iqlabs.writer.writeRow(signer, 'my-app', 'users', JSON.stringify({
  id: 1, name: 'Alice', bio: 'gm'
}));
```

> **EVM gotcha:** unlike Solana, EVM tables require explicit `initializeDbRoot()` + `createTable()` before `writeRow()`. See the chain-specific skill for details.

---

## Full documentation

- **TypeScript (Solana):** https://iqlabs.mintlify.app/docs-typescript ([LLM-friendly](https://iqlabs.mintlify.app/docs-typescript.md))
- **TypeScript (Ethereum):** https://iqlabs.mintlify.app/docs-ethereum
- **TypeScript (Monad):** https://iqlabs.mintlify.app/docs-monad
- **TypeScript (Robinhood Chain):** https://iqlabs.mintlify.app/docs-robinhood
- **Python (Solana):** https://iqlabs.mintlify.app/docs-python ([LLM-friendly](https://iqlabs.mintlify.app/docs-python.md))

## Packages

| Chain | Package | Repo |
|-------|---------|------|
| Solana (TS) | `@iqlabs-official/solana-sdk` | https://www.npmjs.com/package/@iqlabs-official/solana-sdk |
| Ethereum + Monad + Robinhood (TS) | `@iqlabs-official/ethereum-sdk` | https://www.npmjs.com/package/@iqlabs-official/ethereum-sdk |
| Solana (Python) | `iqlabs-solana-sdk` | https://pypi.org/project/iqlabs-solana-sdk/ |

## Useful URLs

| Resource | URL |
|----------|-----|
| Docs home | https://iqlabs.mintlify.app |
| Codebase example CLI | https://github.com/IQCoreTeam/IQSdkUsageExampleCliTool |
| Twitter / X | https://x.com/IQLabsOfficial |
