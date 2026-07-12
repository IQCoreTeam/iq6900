# IQLabs SDK Skills

Per-chain documentation for the IQLabs SDK.

| Skill | URL | Description |
|-------|-----|-------------|
| **solana** (default) | [/skills/solana.md](/skills/solana.md) | TypeScript SDK on Solana — Code In, IQDB tables, connections, encryption |
| **ethereum** | [/skills/ethereum.md](/skills/ethereum.md) | TypeScript SDK on Ethereum (Sepolia) |
| **monad** | [/skills/monad.md](/skills/monad.md) | TypeScript SDK on Monad mainnet + testnet |
| **robinhood** | [/skills/robinhood.md](/skills/robinhood.md) | TypeScript SDK on Robinhood Chain mainnet |
| **python** | [/skills/python.md](/skills/python.md) | Python SDK on Solana |
| **iqgit** | [/skills/iqgit.md](/skills/iqgit.md) | On-chain Git: `iq-git-cli`, [git.iqlabs.dev](https://git.iqlabs.dev), and `git-sdk` for agents/apps |

## Quick Access

```bash
# Solana (TypeScript, default)
curl https://iqlabs.dev/skills/solana.md

# Ethereum (Sepolia)
curl https://iqlabs.dev/skills/ethereum.md

# Monad (mainnet + testnet)
curl https://iqlabs.dev/skills/monad.md

# Robinhood Chain (mainnet)
curl https://iqlabs.dev/skills/robinhood.md

# Python (Solana)
curl https://iqlabs.dev/skills/python.md

# On-Chain Git (CLI + browser + SDK)
curl https://iqlabs.dev/skills/iqgit.md
```

## Which skill do I need?

- **Just trying it out?** → `solana.md` — lowest fees, no `initializeDbRoot` step
- **EVM testnet, no real money?** → `ethereum.md` (Sepolia)
- **Fast, cheap EVM with free testnet faucet?** → `monad.md`
- **Ethereum-compatible L2 with ETH gas (Robinhood)?** → `robinhood.md`
- **Building in Python?** → `python.md` (Solana only)
- **Need GitHub-style repos on chain?** → `iqgit.md` — CLI, browser frontend, embeddable SDK

## SDK entry point

For an overview of all chains and what the SDK does, see [/skill.md](/skill.md).
