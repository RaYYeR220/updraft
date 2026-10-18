# Security

Updraft holds user funds in two places:

- **The round escrow**, between commit and fire or refund.
- **The fee vault**, which holds staked principal and fee income.

We reviewed our own contracts before the first deploy. Each finding got a proof-of-concept test, then a fix, and the test stays in the suite as a regression. Three more findings came after the first testnet deploy:

- **F16** came out of our own end-to-end tests.
- **F17 and F18** came from a fresh full review of the codebase before publishing. Both were reproduced on a fork of the live Ascend contracts.

Each one was fixed with a test that failed first, and the stack was redeployed.

**There has been no third-party audit.** Testnet only.

## Model

- **No admin can move user funds.** Contracts are immutable: no proxies, no upgrade path.
- **What the factory owner can do:**
  - Change protocol parameters, within bounds hard-coded in the factory. The change applies only to rounds created afterwards.
  - Allow or revoke a launchpad. A live round bound to a revoked launchpad aborts at fire and refunds everyone. It never launches on a launchpad we no longer trust.
  - Allow or revoke a Verified-mode attestor. A revoked attestor's vouchers stop working in live rounds; commits already made stay.
- **What the staking owner and the epoch distributor can do:** the distributor (a key the API holds) posts each $DRAFT epoch.
  - **The contract enforces:**
    - epochs are contiguous
    - the amounts fit what the basket actually holds
    - staked principal can never be allocated or frozen
  - **It does not enforce:** that the Merkle root matches the time-weighted split the API publishes. Anyone can recompute the root from public events and check it.
  - **What a wrong root could cost:** it could misallocate that epoch's basket. It couldn't touch stake.
- **Every state-changing call a round needs is permissionless:** fire, distribute, abort, refund, harvest. The keeper is a convenience. If it stops, anyone can send the same transactions.
- **A round ends in exactly one of two ways:**
  - **It launches.**
  - **It aborts and refunds pro-rata from its live balance.** That happens when:
    - the raise is under the minimum
    - the fire deadline (at most 7 days after close) is missed
    - Ascend's curve or quote setup no longer matches the snapshot taken at creation
    - the launchpad was revoked
- **A failed launch never ends a round.** If Ascend's launch reverts, or Ascend is paused, `fire()` reverts and the round stays live for the next attempt. Someone who can make the launch fail on purpose (F16, F17) can only delay the round, never end it.
- **Ascend's launchpad is pinned** by address and by the owner it reports. The factory also records Ascend's token bytecode, which it uses to predict each token's address. The prediction is checked against the address Ascend actually deploys at fire. The token address is known before launch, and only the round can produce it.
- **Accounting is by balance.** Ascend's testnet USDC lets anyone mint and burn anyone's balance, so every payout is capped at what the contract actually holds, and a loss is shared pro-rata.

## Findings

| # | Severity | Finding | Fix | Regression test |
|---|---|---|---|---|
| F01 | Critical | Anyone could overflow the staking contract's reward accumulators with a junk asset, freezing all staked principal | Staking was redesigned. It holds no reward accounting: rewards are paid by epoch, from a Merkle root over time-weighted stake | `UpdraftStaking.t.sol`: `test_stake_unstake_neverDependsOnRewards`, `test_postEpoch_neverAllocatesStakedPrincipal` |
| F02 | High | A 200-asset reward cap with permissionless registration could brick every `fire()` | Removed by the same redesign: no per-asset loops on-chain | `test_platformCut_isDepositedToStaking` |
| F03 | High (testnet) | Public testnet mint overflowed abort refunds and vault accumulators | `mulDiv` for every pro-rata share; per-checkpoint income bound in the vault | `test_F03_abortRefunds_surviveAHugeMint`, `test_F03_hugeQuoteIncome_neverFreezesUnstake` |
| F04 | Medium | `stake()` in the vault skipped the fee pull, so a just-in-time staker took fees accrued before it staked | Stake pulls and routes pending fees first, and the pull can't be skipped (F18) | `test_F04_jitStaker_getsNothingAccruedBeforeItStaked` |
| F05 | Medium | Instant reward crediting let a 0-second stake around a permissionless trigger take most of each reward | Time-weighted epochs | `test_claim_paysEpochAllocation_once`, `test_postEpoch_onlyDistributor_andContiguousWindows` |
| F06 | Medium | An unbounded fire deadline plus an invalid listing cap could trap commits for years | Fire window ≤ 7 days; listing cap validated; a refused listing no longer blocks the launch | `test_create_rejectsLongFireWindow`, `test_create_rejectsListingCapOverUint88`, `test_F06_refusedListing_doesNotBlockFire` |
| F07 | Medium | 1-wei commits could fill every participant slot | Minimum commit; withdrawing to zero frees the slot | `test_F07_dustCommit_refused`, `test_F07_withdrawToZero_freesTheSlot` |
| F08 | Medium | The vault's EIP-1271 signature check was unscoped, so with a 1271-aware quote the creator could sign away vault funds | EIP-1271 removed from the vault | `test_F08_noEip1271` |
| F09 | Low | A quote shortfall also blocked the token payout | Token and quote payouts decoupled | `test_F09_quoteShortfall_doesNotBlockTokens` |
| F10 | Low | Abort refunds paid from a snapshot, so a later loss reverted the last refunders | Pro-rata of the live balance | `test_F10_postAbortBurn_isSharedProRata` |
| F11 | Low | Rewards queued with no stakers went to whoever staked first | With no stakers, the stakers' leg goes to Ascend's bid (quote) and the platform basket (token) | `test_F11_noStakers_legGoesToBidAndPlatform` |
| F12 | Low | Exiting the vault left the listing set-aside to the exit target | Exit reclaims the set-aside and routes it first, and stops if the desk can't close or release it (F18) | `test_F12_exit_reclaimsListingSetAsideBeforeHandoff`, `test_F18_exitCannotSkipALiveListing` |
| F13 | Low | The factory accepted a zero creator | Rejected | `test_create_rejectsZeroCreator` |
| F14 | Info | A one-block Ascend pause made `fire()` abort permanently | `fire()` reverts while paused; the round stays live | `test_F14_pausedLaunchpad_fireRevertsAndRoundStaysLive` |
| F15 | Info | A pre-existing escrow shortfall was spread onto later commits | Commits are refused while the escrow is short | `test_F15_commitWhileEscrowShort_refused` |
| F16 | High | **Found after the first deploy.** `fire()` turned a reverting launch into an abort. A caller could pick a gas limit that starved Ascend's launch a few calls deep but left enough gas to finish the abort, and so end any round at T0 | Superseded by F17: a reverting launch now reverts `fire()`, so starving it only wastes the caller's gas | `test_F16_starvedLaunch_revertsAndRoundStaysLive`, `test_F16_starvedListing_revertsInsteadOfSkipping` |
| F17 | Critical | **Found by the pre-publication review.** Ascend's launch takes the lock on PancakeSwap Infinity's vault. A contract already holding that lock could call `fire()` from inside it: the launch reverted, and the round's catch aborted the round. No gas tuning was needed | `fire()` no longer catches the launch. A failed launch reverts `fire()`, and the round stays live until it launches or its deadline refunds everyone | `test_F17_launchRevert_revertsFire_thenTheDeadlineRefunds`, `test_F17_fireInsideAForeignLock_revertsAndTheRoundStaysLive`, `test_fork_fireInsideAForeignLock_revertsAndTheRoundStaysLive` |
| F18 | High | **Found by the same review.** The vault's fee pull swallowed a failed `collect`. Inside a foreign Infinity lock, or with too little gas, collect was skipped. A stake, a policy change or an exit could then land before the fees that accrued earlier were routed. Separately, an exit with an estimated gas limit could skip closing the listing set-aside | The pull refuses to run inside a held Infinity lock (`VaultLocked`) or below 3M gas (`InsufficientGas`). Exit calls the listing desk directly, so a failed close or release stops the exit | `test_F18_pullInsideAForeignLock_reverts`, `test_F18_starvedPull_reverts`, `test_F18_exitCannotSkipALiveListing`, `test_fork_stakeInsideAForeignLock_reverts` |

Code-level items, also fixed:

- The certificate's policy hash covers the exit and listing settings (`test_I1_policyHash_coversExitAndListing`).
- The participant cliff plus duration is capped at 30 days (`test_create_rejectsLongParticipantLock`).
- A queued exit or listing can be cancelled (`test_I5_cancelExitAndListing_andCapBound`).
- A revoked attestor's vouchers stop working in live rounds (`test_I6_revokedAttestor_refusesNewVouchers`).

## What F16 and F17 taught us

Both bugs came from one line of reasoning that looked safe:

1. We expected a launch to revert only for reasons inside Ascend: the curve changed, the quote was dropped, the slippage check failed.
2. So `fire()` caught the revert and refunded everyone at once, instead of making them wait for the deadline.

That reasoning ignores the caller. Whoever sends `fire()` controls the context the launch runs in, so whoever sends it decides whether the launch fails:

- **Gas (F16).** Ascend's launch runs four calls deep: launchpad → Infinity vault → lock callback → pool manager. Each frame keeps 1/64 of the gas it forwards, so a launch starved at the bottom hands the round back about 6% of what it was given. That is enough to finish an abort, and it looks exactly like an honest revert. The usual check, "more than 1/64 left after the call", doesn't catch it. We found it because `eth_estimateGas` on an anvil fork chose exactly that gas limit.
- **The lock (F17).** Infinity allows one locker at a time. A contract that holds the lock and calls `fire()` from its callback makes the launch revert, with plenty of gas left.

A fixed gas floor closed F16 but not F17. The fix that closes the whole class is not to catch the launch at all. A failed launch costs the round time (at most the 7-day fire window), never its launch. The vault's fee pull had the same shape, a `collect` that was allowed to fail, and the same two triggers. F18 closes them explicitly.

## Off-chain hardening

These also came from the pre-publication review.

- **The attestor read the round's config through a hand-written ABI.** That ABI had drifted from the deployed contract, so any Verified round with a listing set-aside failed to attest. The attestor now uses the SDK's generated ABIs, and a test decodes a real encoded config.
- **The attestor signed a voucher when the explorer was unreachable.** The sybil check silently passed. It now refuses with `unavailable`, the same way it does when Hyperliquid is down.
- **The test-USDC drip trusted the first `X-Forwarded-For` entry, which any client can write.** It now uses the address Cloud Run appends. It also caps total drips per hour, and takes reservations one at a time on a single-instance service.
- **The app accepted rounds in quotes other than USDC but formatted every amount as 6-decimal USDC.** The studio now creates USDC rounds only. A round in another quote shows a notice instead of a commit form.

## Known limits (not fixed)

- **Donated quote after fire.** USDC sent straight to a round, outside `commit`, is used if the round aborts but stays in the round after it fires.
- **Creator attribution.** `createRound` doesn't bind the named creator to the sender, so anyone can create a round naming any address. No funds are at risk. Treat the creator shown on a round page as what the round records, not as an endorsement.
- **Open mode can't stop a creator using several wallets.** In Open mode, the creator cap and the creator's vesting bind only the creator's own wallet. Verified mode makes them meaningful, one identity per wallet. The round page says which mode a round runs in.
- **The attestor is a trusted signer.** Verified mode relies on a key we run. It is published, revocable, and explains every refusal with evidence. Creators who don't want to rely on it use Open mode.
- **The epoch distributor is a trusted poster** (see Model). Every root can be checked; none of them can be forced to match.
- **Testnet quote.** Ascend's testnet USDC can be minted and burned by anyone.
  - The contracts stay solvent under that (F03, F10, F15), but a burn can shrink a refund.
  - A burn from a live round's escrow pauses new commits until someone makes up the gap.
  - Mainnet USDC has no such function.

## Reporting

Please open a GitHub issue marked `security`, or contact the maintainer listed on the GitHub profile.
