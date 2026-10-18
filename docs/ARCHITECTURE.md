# Architecture

Updraft is a contract layer on top of Ascend. It has no pools, curves or hooks of its own. It uses four things Ascend already offers:

- the launch's fee-free dev-buy
- the creator role
- the buy-support bid (`fundBid`)
- the listing desk

Off-chain services index, attest and automate. None of them can move user funds.

```
          commit / withdraw               fire (anyone)                      distribute / claim
 wallets ───────────────────▶ UpdraftRound ─────────────▶ AscendLaunchpad.launch ──▶ tokens to the round
                               │    │                     (fee-free dev-buy)              │
                               │    ├─ 1% fundBid ───────▶ Ascend's bid                   ├─▶ wallets, pro-rata
                               │    ├─ 0.5% tokens ──────▶ UpdraftStaking ($DRAFT basket)  └─▶ creator, vested
                               │    ├─ clone + creator role ▶ CreatorVault ─▶ fees by policy
                               │    └─ record ──────────▶ LaunchCertificate
                               └─ abort ─▶ refunds pro-rata of the live balance
```

## Contracts

All contracts are Solidity 0.8.30 and immutable: no proxies, no upgrades. Rounds and vaults are ERC-1167 clones.

### UpdraftFactory

- Creates rounds with CREATE2 from `keccak(sender, salt)`. The round's address, and so the token's address, are known at creation.
- Validates every round against Ascend's live state, so a round that can never fire is rejected at creation:
  - the launchpad is on the allowlist and Ascend's owner matches; the factory predicts the token's address from the token bytecode recorded for that launchpad, and fire checks the prediction
  - the quote is allowed
  - windows are ordered, and the fire window is at most 7 days
  - `maxRaise` is within the curve's capacity, so there are no partial fills
  - vesting: the creator's is at least as strict as the participants'; the participants' cliff plus duration is at most 30 days
  - the policy is within bounds, and the platform share is pinned
  - in Verified mode, the attestor is allow-listed
- Parameters are snapshotted per round. The owner can change them only within hard bounds:

  | Parameter | Live | Bound |
  |---|---|---|
  | `parityBps` | 1% | ≤ 2% |
  | `platformTokenBps` | 0.5% | ≤ 2% |
  | `platformFeeBps` | 10% | ≤ 20% |
  | `maxTeamBps` | 60% | ≤ 60% |
  | `minPolicyTimelock` | 5 min (testnet) | ≥ 5 min |

### UpdraftRound

One per launch. It holds the escrow from the first commit until fire or refund.

| Phase | Calls |
|---|---|
| `openAt` → `lockAt` | `commit`, `commitWithPermit` (EIP-2612, one transaction), `withdraw` |
| `lockAt` → `closeAt` | Commits only. Withdrawals stop, so last-second fake demand can't be pulled |
| `closeAt` → `fireBy` | `fire()` from anyone |
| After fire | `distribute(from, to)` from anyone, in chunks. `claim()` covers vesting and anyone not yet pushed |
| Aborted | `refundAborted()` |

**Verified mode.** A commit carries an EIP-712 voucher from an allow-listed attestor:

```
{ round, wallet, identityId, expiry, evidenceHash }
```

One identity maps to one wallet per round, and each wallet is held to the round's wallet cap. The cap is flat, because Hyperliquid history is an eligibility gate, not a wealth ladder. The round folds every `evidenceHash` into an accumulator that the certificate records, so the attestor's published evidence can be checked against the chain.

**`fire()`, in order:**

1. **Preflight.** Is the launchpad still allowed, is the quote still allowed, does the curve hash still equal the snapshot taken at creation?
   - If any of these fails, the round aborts.
   - If Ascend is paused, `fire()` reverts and the round stays live.
2. **Amounts.** `usable = min(totalCommitted, balance)`, so a testnet burn is shared pro-rata. `effective = min(usable, maxRaise)`, and `parity = 1%` of it.
3. **Launch.** `launch({devBuyQuote: effective − parity, minDevOut: lens preview, creator: round})`.
   - The lens preview is exact, so `minDevOut` has zero slack.
   - If the launch reverts, `fire()` reverts and the round stays live for the next attempt. Whoever sends `fire()` controls the context the launch runs in, so a failed launch must never end a round (F16 and F17 in [SECURITY.md](SECURITY.md)). If it never succeeds, the fire-by deadline refunds everyone.
4. **Fee parity.** `fundBid(poolId, parity)`.
5. **Vault.** Clone a `CreatorVault` with salt `poolId`. Ascend's `transferCreator` hands it the role, and the vault accepts in the same transaction. If configured, the vault also enrolls the HyperCore listing set-aside.
6. **Platform cut.** 0.5% of the tokens out go to `UpdraftStaking.deposit`.
7. **Record.** Store `tokensOut`, `netTokens`, `quoteUsed` and `refundPool`, and write the certificate. The top-1 and top-10 shares are computed over every participant at fire.

**Allocation is lazy, with no Merkle tree:**

- `tokens_i = netTokens × c_i / total`, vested by the wallet's schedule. The creator's commit uses the creator schedule.
- `refund_i = refundPool × c_i / total`, which covers the scale-down when the round is oversubscribed.
- Every wallet pays `quoteUsed / netTokens`.

### CreatorVault

Holds Ascend's creator role for one pool.

- **`harvest()`** is permissionless. It calls `collect`, then claims the token and quote legs separately (each in try/catch, so a bad quote can't strand the token side), then routes by balance delta since the last checkpoint. Fees that arrive another way, such as someone calling Ascend's `claim` directly, are routed too.
- **Legs** are in bps and sum to 10,000:
  - `platform`, pinned at creation, to `UpdraftStaking`
  - `bid`, to Ascend's `fundBid` (quote only)
  - `stakers`, for holders who stake the token in this vault (reward-per-token, quote and token)
  - `team`, claimable by the creator

  With no stakers, the stakers' leg goes to the bid (quote) and the platform basket (token).
- **Policy changes.** `queuePolicy` stays within the bounds fixed at launch. `executePolicy` runs after the timelock, and first routes pending fees under the old split. Out-of-bounds changes revert.
- **Exit** is optional per round, creator-only and timelocked. It reclaims the listing set-aside before handing over the role.
- **Staked principal** is kept strictly apart from token-fee income, even though both are the same token.

### LaunchCertificate

A write-once record per token. Only a factory round can write it, and only about itself. Fields:

- round, token, pool, fire time
- quote used, tokens out, platform tokens, average price
- participants, verified identities
- top-1 and top-10 shares in bps
- creator tokens, creator and participant vesting
- policy hash, covering the policy, its bounds, the exit setting and the listing cap
- attestor, evidence accumulator, shortfall

### UpdraftStaking

Stake $DRAFT. Rounds and vaults deposit the platform basket.

- **Staking keeps no reward accounting.** `stake` and `unstake` touch only balances, so principal can never be frozen by reward math.
- **Rewards are paid by epoch.** A distributor posts `(root, end, assets[], amounts[], uri)`. The contract enforces:
  - epochs are contiguous
  - the amounts fit what is actually available
  - staked principal is never allocated
- **Claims** take a proof against the root. The leaf is `keccak256(bytes.concat(keccak256(abi.encode(account, asset, amount))))`.
- **The root is computable by anyone.** It covers time-weighted stake (stake × seconds inside the epoch) for every staker, built from public `Staked` and `Unstaked` events. A stake added and removed in the same second earns nothing.

### CurveLens and UpdraftLens

`CurveLens` replicates Ascend's launch curve and the Infinity CL swap math to the wei:

- the 15 bands, the start tick and the tick spacing
- the bitmap word search
- rounding on every amount delta

`UpdraftLens` exposes `preview`, `capacity` and `priceAfter` for the app and the SDK. Fork tests check the lens against real launches.

## Services

| Service | Stack | Role |
|---|---|---|
| Indexer | Ponder 0.18, embedded PGlite (Postgres when `DATABASE_URL` is set) | Indexes the factory, every round (as a factory child), vaults (matched by event signature), the certificate registry, and the pool manager's swaps on Ascend pools. REST and GraphQL |
| API | Hono on Node 24 | The Verified-mode attestor (below), evidence by hash, test-USDC drip, the $DRAFT epoch builder (`POST /epochs/run` behind a bearer token), `/analysis` |
| Keeper | Node 24 | Fires at close, distributes, aborts expired rounds, harvests vaults. Spending is capped at 120 tx/hour. It backs off only after a mined revert |
| Web | Next.js 16, React 19, wagmi 3 | Rounds, round page, studio, console, staking, certificates, docs, embed |

**Attestor.** The rules are versioned and published at `GET /rules/v1`. A Hyperliquid account must pass both of these:

- it is at least 30 days old
- it has at least one of: 5 fills, 1 HYPE staked, or $1,000 traded

On Elysium, a wallet first funded by a private address that already funded another voucher holder in the same round is refused. Public hubs never link wallets. A hub is any contract, or any address with 5,000 or more transactions, which covers bridges, faucets and exchanges.

Every decision, approval or refusal, stores its inputs under an evidence hash. If Hyperliquid's API is unavailable, the attestor refuses. It never guesses.

Hosting:

- The API, indexer and keeper run on Cloud Run.
- The API keeps attestations, evidence and epochs in Supabase Postgres. It runs as a single instance, so the drip's limits are checked and reserved one request at a time.
- The indexer uses an embedded database. It rebuilds from the chain whenever it restarts, which takes minutes, because all of its state is derived from events.
- Secrets are only in the environment.

## Integrator surface

- **SDK** (`@updraft/sdk`, viem): every contract call plus previews, address prediction and typed reads. See [SDK.md](SDK.md).
- **MCP server** (`@updraft/mcp`): seven tools. The read tools cover rounds, price preview, certificate and the bottom-of-curve study. The build tools return unsigned commit and create transactions after checking that the round is real and open. See [MCP.md](MCP.md).
- **Widget**: `<script src="…/updraft-widget.js" data-round="0x…">` embeds a live round. It is under 1 KB, and it accepts height messages only from its own frame and origin.
