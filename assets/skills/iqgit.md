---
name: iqlabs-iqgit
version: 1.0.0
description: On-chain Git on Solana — CLI, browser frontend, and embeddable SDK. Push commits as Solana inscriptions, browse them at git.iqlabs.dev, deploy them as iqpages sites.
---

# IQLabs SDK — On-Chain Git

GitHub-style repos stored entirely on Solana. Three surfaces, one source of truth:

- **`iq-git-cli`** — `iqgit init / commit / push / clone` from your shell
- **git.iqlabs.dev** — browser frontend: gallery, code view, in-browser editor, iqpages deploy
- **`@iqlabs-official/git-sdk`** — drop on-chain Git into any agent, app, or dApp

All three speak the same on-chain format. A commit you push from the CLI is browsable on git.iqlabs.dev, deployable as an iqpages site at `browser.iqlabs.dev/<your-name>.sol`, and readable from any app that imports `git-sdk`.

> Full docs: https://iqlabs.mintlify.app/docs-iqgit ([LLM-friendly](https://iqlabs.mintlify.app/docs-iqgit.md))
> CLI: https://www.npmjs.com/package/@iqlabs-official/iq-git-cli
> SDK: https://www.npmjs.com/package/@iqlabs-official/git-sdk
> Frontend: https://git.iqlabs.dev

---

## CLI: GitHub on your laptop

```bash
npm install -g @iqlabs-official/iq-git-cli
```

`iqgit` is then available globally. First write command (`create`, `push`, `wallet balance`) walks through wallet + RPC setup once. Read commands (`clone`, `log`, `registry`) need no wallet.

### Push your first repo

```bash
iqgit init                        # create local .iqgit/
iqgit create my-app --public      # register repo on chain
iqgit add .
iqgit commit -m "first"
iqgit push                        # uploads blobs + tree + commit row
```

### Clone someone else's repo

```bash
iqgit clone <owner>/<repo>
```

`<owner>` is a Solana wallet address (repo creator); `<repo>` is the name they registered.

### Commands

| Command | Purpose |
|---|---|
| `iqgit init` | Create local `.iqgit/`. No chain interaction. |
| `iqgit create <name> [--public\|--private]` | Register repo on chain. |
| `iqgit add` / `iqgit reset` | Stage / unstage paths. |
| `iqgit commit -m "..."` | Snapshot staged paths locally. No chain write. |
| `iqgit push` | Upload pending commits. Resume-safe. |
| `iqgit clone <owner>/<repo> [dir]` | Pull latest snapshot to disk. |
| `iqgit restore [commitId]` | Restore working tree to a commit. |
| `iqgit log [--limit N]` | Print commit history. |
| `iqgit status` | 4-tier diff: HEAD vs pending vs staged vs working tree. |
| `iqgit registry [--limit N]` | Browse the public on-chain repo gallery. |
| `iqgit config [key] [value]` | Get / set global config. |
| `iqgit wallet new\|show\|balance\|repos` | Manage keypair. |

### How `push` works

Each push writes three kinds of records:

1. **Blobs** — file contents, one inscription per unique hash.
2. **Tree** — JSON map of `{ path: { txId, hash } }`, one per commit.
3. **Commit row** — `{ id, message, treeTxId, parentCommitId, timestamp, author }`.

`commit` builds these locally; `push` uploads them. Splitting the two means you can batch many commits into a single push and amortize Solana fees.

### Resume on failure

`push` is checkpointed end-to-end. Each blob's `{ hash → txId }` is appended to `.iqgit/upload-cache.json` on success (synchronous flush). The tree's txId and the commit row's signature are persisted into the pending commit's `meta.json` between steps. If the push dies partway, the next `iqgit push` resumes from the last checkpoint — already-uploaded blobs are reused from cache.

### Gateway routing

Read-heavy commands route through the IQ Gateway HTTP cache by default, with raw RPC as final fallback.

| `GATEWAY_URL` | Behavior |
|---|---|
| (unset, default) | 3-gateway chain → RPC fallback (recommended) |
| `https://my.gateway` | Single override → RPC fallback |
| `url1,url2,url3` | Comma list, tried in order → RPC |
| `off` | Disable gateway, raw RPC only |

---

## Browser: git.iqlabs.dev

A GitHub-style frontend running entirely on top of the on-chain state the CLI writes. **No backend, no database** — every screen pulls straight from Solana.

- **Browse the public registry** — gallery of every public repo created through the CLI or frontend.
- **View any repo by `<wallet>/<repo>`** — file tree, README, commit history. URL shape mirrors GitHub.
- **Edit in the browser** — connect wallet, open a repo you own, edit file, save → commit lands on chain via the SDK.
- **Deploy as a website** — see below.

### Deploy a repo as an iqpages site

Any repo with an `iqpages.json` manifest can be deployed as a static site at `browser.iqlabs.dev/<your-name>.sol`.

1. Add `iqpages.json` (optionally `iqprofile.json`) to your repo locally.
2. Commit and push:
   ```bash
   iqgit add iqpages.json
   iqgit commit -m "add pages manifest"
   iqgit push
   ```
3. Open `git.iqlabs.dev/<wallet>/<repo>` → **Pages** tab → **Deploy**.
4. The frontend writes an `iqpages` registration on chain. Your site is served via the iqpages proxy at `browser.iqlabs.dev`. Original URL stays the same — visitors never see a redirect.

Deploys are signed by the repo owner's wallet. There's no build server — the proxy reads your latest commit from chain at request time and serves the matching files.

### browser.iqlabs.dev resolver

One URL space, four dispatchers, all driven by Solana data:

- `browser.iqlabs.dev/<name>.sol` — SNS pointing at an iqpages deployment. Proxy serves the site in place.
- `browser.iqlabs.dev/<pubkey>` — wallet, table PDA, or git repo address. Dispatches by shape.
- `browser.iqlabs.dev/<txSignature>` — transaction inspector with in-browser payload viewer.
- `browser.iqlabs.dev/<wallet>/<repo>` — short link → git.iqlabs.dev.

For Git: hand someone `browser.iqlabs.dev/<your-name>.sol` and they get your hosted site. Hand them `browser.iqlabs.dev/<wallet>/<repo>` and they get the repo page. Both stable for as long as your wallet exists — no DNS, no hosting bill, no expiry.

---

## SDK: embed on-chain Git

Use [`@iqlabs-official/git-sdk`](https://www.npmjs.com/package/@iqlabs-official/git-sdk) when you're building your own agent, app, or dApp that should read or write the same on-chain Git repos the CLI and git.iqlabs.dev use.

```bash
npm install @iqlabs-official/git-sdk
```

Peer deps: `@solana/web3.js`, `@iqlabs-official/solana-sdk` (aliased `iqlabs-sdk`), `buffer`.

### Browser (frontend / dApp)

```typescript
import { GitClient, readRegistryPage } from "@iqlabs-official/git-sdk/browser";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

const { connection } = useConnection();
const wallet = useWallet();

// Read-only — no wallet required.
const entries = await readRegistryPage(connection, { limit: 50 });

// Write — needs a connected wallet adapter.
const client = new GitClient({
  connection,
  signer: {
    publicKey: wallet.publicKey!,
    signTransaction: wallet.signTransaction!,
    signAllTransactions: wallet.signAllTransactions!,
  },
});

await client.createRepo({
  name: "my-repo",
  description: "hello on-chain",
  isPublic: true,
  timestamp: Date.now(),
});
```

### Node (CLI / agent / server)

```typescript
import { GitClient } from "@iqlabs-official/git-sdk/node";
import { Connection, Keypair } from "@solana/web3.js";

const connection = new Connection(process.env.SOLANA_RPC_ENDPOINT!);
const signer = Keypair.fromSecretKey(/* secret key bytes */);
const client = new GitClient({ connection, signer });

await client.commit("my-repo", "initial", scan);
```

### Pick the right entry

| Import | When |
|---|---|
| `@iqlabs-official/git-sdk` | Types + pure functions only. No SHA-256 backend. |
| `@iqlabs-official/git-sdk/browser` | Installs SubtleCrypto SHA-256. Browser apps. |
| `@iqlabs-official/git-sdk/node` | Installs `node:crypto` SHA-256. CLI / server / agent. |

Import the platform entry **exactly once** before calling any function that hashes content (`commit`, `status`, etc.).

### API surface

- `GitClient` — high-level workflows: `createRepo`, `commit`, `checkout`, `clone`, `log`, `status`.
- `readOwnerRepos`, `readRegistryPage` — owner list + public gallery.
- `readLatestCommit`, `readCommitHistory` — direct commit-table reads.
- `loadTree`, `loadBlob` — pull a stored `tree.json` or file blob by tx signature.
- `bootstrapRegistry` — one-time admin call to initialize the global registry on a fresh network.

`SignerInput` from `@iqlabs-official/solana-sdk` is accepted everywhere a signer is needed: a `Keypair`, web3.js `Signer`, or wallet adapter object with `signTransaction` / `signAllTransactions`.

### Use cases

- **AI agents** — give an agent a wallet + `GitClient.commit()`; it can push reproducible artifacts on chain after every run.
- **dApps** — let users save app state, configs, or content packs in versioned repos they own.
- **Build pipelines** — replace S3/GitHub uploads with on-chain inscriptions anyone can clone without auth.

---

## How the pieces fit together

```
              ┌──────────────────────────┐
              │   Solana inscriptions    │
              │  (blobs + trees + rows)  │
              └────────────┬─────────────┘
                           │
        ┌──────────────────┼────────────────────┐
        │                  │                    │
   ┌────▼─────┐      ┌─────▼──────┐       ┌─────▼──────┐
   │  iq-git  │      │  git.iqlabs│       │  git-sdk   │
   │   CLI    │      │   .dev     │       │   (npm)    │
   └────┬─────┘      └─────┬──────┘       └─────┬──────┘
        │                  │                    │
     terminal           browser        agents / apps / dApps
```

A commit you push from the CLI is browsable on git.iqlabs.dev, deployable as an iqpages site on browser.iqlabs.dev, and readable from any app that imports git-sdk.
