# Updraft

**Fair launches on Ascend. Everyone lands at the same price, the dev included.**

On a bonding-curve launchpad the bottom of the curve goes to whoever is there first: the dev's own buy, bundled wallets, snipers. Updraft collects a round of commits before launch and spends the whole pot as Ascend's launch buy, in one transaction, so every wallet gets the same average price.

Updraft runs on Elysium testnet (chain 99801) against the real Ascend launchpad. It uses no mocks of Ascend.

- **App:** https://updraft-weld.vercel.app
- **API:** https://updraft-api-494617981995.us-central1.run.app
- **Indexer:** https://updraft-indexer-494617981995.us-central1.run.app
- **Contracts:** listed under [Deployed](#deployed). All are verified on Blockscout.
- **Proof:** [docs/PROOF.md](docs/PROOF.md) lists every live transaction. To check the whole thing in five minutes, follow [docs/REVIEWING.md](docs/REVIEWING.md).

## The problem, measured

We read every launch on Ascend's four testnet launchpads up to block 11,040,000 (251 launches):

- 49 had a dev-buy.
- In 33, the creator side took more than 20% of supply in the first minute.
- The worst case took 98.3%.
- After the biggest dev-buys, the next token cost up to 12.8× the dev's average price.

Method, caveats and data: [docs/ANALYSIS.md](docs/ANALYSIS.md). Live endpoint: `GET /analysis` on the API.

Ascend's launch already does two good things. The dev-buy is atomic and pays no fee, and the liquidity is locked forever. What's still open is the supply: whoever writes the dev-buy owns the bottom of the curve.

## How a round works

1. **Commit.** Before launch, anyone can commit USDC to a round, and can withdraw until the lock. Each round has a minimum commit and a cap per wallet. A round can also run in **Verified** mode, where the cap is one per verified Hyperliquid account. The token's address and a live price preview are known from the start.
2. **Fire.** At T0, one transaction turns the whole pot into Ascend's fee-free launch buy. Anyone can send it. Everyone in the batch pays one average price. A buyer right after pays Ascend's launch fee, which decays from 90% to 1% over five seconds, on top of a higher price.
3. **Land.** Tokens are pushed to every wallet. Oversubscription is refunded pro-rata. The dev's own share vests in public, with a cliff and a linear unlock.
4. **Fees by policy.** Ascend's creator role goes to a vault that splits creator fees four ways:
   - Ascend's own buy-support bid
   - holders who stake the token in the vault
   - the team
   - the platform

   The split can change only within bounds fixed at launch, and only after a timelock.
5. **Certificate.** Every launch writes an on-chain record: participants, top-1 and top-10 concentration, the dev's vesting, and a hash of the fee policy, including the exit and listing settings.
6. **Fail-safe.** The round aborts and refunds pro-rata if any of these happens:
   - the raise is below the minimum
   - the fire deadline is missed
   - Ascend's curve or quote setup changed
   - the launchpad was retired

   A failed launch never ends a round. If Ascend is paused, or a launch attempt fails, fire reverts and the round waits for the next attempt.

**Fee parity.** Ascend's launch buy pays no fee, and Updraft doesn't take that for free: 1% of every batch goes to Ascend's own bid.

**$DRAFT.** Staking $DRAFT earns the platform basket: 0.5% of every launch's tokens and 10% of every vault's creator fees. It is paid by epoch, as a Merkle root over time-weighted stake that anyone can recompute from public events. Staking holds no reward accounting, so principal can never be frozen.

## Proof, in one line

A bot's pre-signed 100 USDC buy landed one second after a round fired, while Ascend's launch fee was still 72.2%. The batch got 5.13× more tokens per USDC than the bot. Every transaction is in [docs/PROOF.md](docs/PROOF.md).

## Repository

| Path | What |
|---|---|
| `contracts/` | Foundry. `UpdraftFactory`, `UpdraftRound`, `CreatorVault`, `LaunchCertificate`, `UpdraftStaking`, `UpdraftLens` and `CurveLens` (a wei-exact replica of Ascend's launch curve) |
| `packages/sdk` | TypeScript SDK on viem: create, commit (with permit), fire, distribute, claim, vault and staking calls, previews |
| `packages/mcp` | MCP server. Read tools plus tools that build unsigned transactions. It never holds keys |
| `packages/widget` | One script tag that embeds a live round on any site |
| `services/api` | Hono. Hyperliquid attestor for Verified rounds (with evidence and refusals), epoch builder for $DRAFT, test-USDC drip |
| `services/indexer` | Ponder. Rounds, commits, vault flows, certificates, Ascend pool swaps |
| `services/keeper` | Fires, distributes, aborts and harvests on schedule. Every one of those calls is permissionless; the keeper is a convenience |
| `services/analysis` | The bottom-of-curve study above, reproducible from the chain |
| `apps/web` | Next.js app: rounds, round page, studio, console, staking, certificates, docs |
| `deployments/` | Deployed addresses |

Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Security review: [docs/SECURITY.md](docs/SECURITY.md). What we claim and how strongly: [docs/CLAIMS.md](docs/CLAIMS.md).

## Deployed

Elysium testnet, chain 99801, from block 11,174,917.

| Contract | Address |
|---|---|
| UpdraftFactory | [0xA94cdA7c7184C060842569Da8dFC33Ca747Fb232](https://elysium.kinetiq.xyz/testnet-explorer/address/0xA94cdA7c7184C060842569Da8dFC33Ca747Fb232) |
| UpdraftRound (implementation) | [0xFf5d6E05Ed6737C630F48cC633715e537f4b55E8](https://elysium.kinetiq.xyz/testnet-explorer/address/0xFf5d6E05Ed6737C630F48cC633715e537f4b55E8) |
| CreatorVault (implementation) | [0xA2BA1bEBFdc7dDa9fbf866aF4a8dAe1207B2F7ED](https://elysium.kinetiq.xyz/testnet-explorer/address/0xA2BA1bEBFdc7dDa9fbf866aF4a8dAe1207B2F7ED) |
| LaunchCertificate | [0xA85F433603001AA2b85272929157f31F9785cDd1](https://elysium.kinetiq.xyz/testnet-explorer/address/0xA85F433603001AA2b85272929157f31F9785cDd1) |
| UpdraftStaking | [0x90A39170D14C22711dC7dDbeF1367d58cbFA7E6f](https://elysium.kinetiq.xyz/testnet-explorer/address/0x90A39170D14C22711dC7dDbeF1367d58cbFA7E6f) |
| UpdraftLens | [0x133a4133937a5CE0120E281623fe56bADCFC2bEA](https://elysium.kinetiq.xyz/testnet-explorer/address/0x133a4133937a5CE0120E281623fe56bADCFC2bEA) |
| Ascend launchpad (theirs) | [0x6d01f6644bbf1b5074472D3e85aa1465B4d2bF3d](https://elysium.kinetiq.xyz/testnet-explorer/address/0x6d01f6644bbf1b5074472D3e85aa1465B4d2bF3d) |

## Run it

Requirements: Node 24, pnpm 9, Foundry.

```sh
pnpm install

# contracts: unit, invariant and fork tests (fork tests use the public Elysium RPC, pinned to a block)
cd contracts && forge test

# every TypeScript package
pnpm -r test
```

To deploy your own stack: `contracts/script/Deploy.s.sol` (env: `DEPLOYER_PRIVATE_KEY`, `ATTESTOR_ADDRESS`, optional `DISTRIBUTOR_ADDRESS`). It writes `deployments/<file>.json`, which the SDK, indexer and keeper read.

| Suite | Tests |
|---|---|
| Contracts (unit, invariant, fork against live Ascend) | 136 |
| API / attestor / epochs | 27 |
| Keeper | 10 |
| MCP | 9 |
| Analysis | 4 |
| Widget | 4 |
| SDK (end to end on an Elysium fork) | 2 |
| Web (Playwright, against the live app and testnet) | 19 |

## Limits we know about

Testnet only, because Ascend isn't on mainnet yet. The Verified-mode attestor is a signer we run. We did our own security review; there has been no third-party audit. The full list, with what each limit costs: [docs/CLAIMS.md](docs/CLAIMS.md#limits).

## License

MIT
