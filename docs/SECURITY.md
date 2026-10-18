# Security

Updraft holds user funds in two places:

- **The round escrow**, between commit and fire or refund.
- **The fee vault**, which holds staked principal and fee income.

We reviewed our own contracts before the first deploy. Each finding got a proof-of-concept test, then a fix, and the test stays in the suite as a regression. One more finding (F16) came out of our end-to-end tests after the first testnet deploy; we fixed it and redeployed.

**There has been no third-party audit.** Testnet only.

## Model

- **No admin can move user funds.** Contracts are immutable: no proxies, no upgrade path. The factory owner can only do these things, and each one affects only rounds created afterwards:
  - allow or revoke a launchpad
  - allow or revoke an attestor
  - change protocol parameters, within bounds hard-coded in the factory
- **Every state-changing call a round needs is permissionless:** fire, distribute, abort, refund, harvest. The keeper is a convenience. If it stops, anyone can send the same transactions.
- **Every round can fail closed.** Each of these aborts the round and refunds pro-rata from the live balance:
  - the raise is under the minimum
  - the fire deadline is missed
  - Ascend's curve or quote setup no longer matches the snapshot taken at creation
  - the launchpad was revoked
  - the launch reverts

  A paused launchpad makes `fire()` wait instead of abort.
- **Ascend's launchpad is pinned three ways:** by address, by the owner it reports, and by the token bytecode its CREATE2 produces. The token address is known before launch, and only the round can produce it.
- **Accounting is by balance.** Ascend's testnet USDC lets anyone mint and burn anyone's balance, so every payout is capped at what the contract actually holds, and a loss is shared pro-rata.

## Findings

| # | Severity | Finding | Fix | Regression test |
|---|---|---|---|---|
| F01 | Critical | Anyone could overflow the staking contract's reward accumulators with a junk asset, freezing all staked principal | Staking was redesigned. It holds no reward accounting: rewards are paid by epoch, from a Merkle root over time-weighted stake | `UpdraftStaking.t.sol`: `test_stake_unstake_neverDependsOnRewards`, `test_postEpoch_neverAllocatesStakedPrincipal` |
| F02 | High | A 200-asset reward cap with permissionless registration could brick every `fire()` | Removed by the same redesign: no per-asset loops on-chain | `test_platformCut_isDepositedToStaking` |
| F03 | High (testnet) | Public testnet mint overflowed abort refunds and vault accumulators | `mulDiv` for every pro-rata share; per-checkpoint income bound in the vault | `test_F03_abortRefunds_surviveAHugeMint`, `test_F03_hugeQuoteIncome_neverFreezesUnstake` |
| F04 | Medium | `stake()` in the vault skipped the fee pull, so a just-in-time staker took fees accrued before it staked | Stake pulls and routes pending fees first | `test_F04_jitStaker_getsNothingAccruedBeforeItStaked` |
| F05 | Medium | Instant reward crediting let a 0-second stake around a permissionless trigger take most of each reward | Time-weighted epochs | `test_claim_paysEpochAllocation_once`, `test_postEpoch_onlyDistributor_andContiguousWindows` |
| F06 | Medium | An unbounded fire deadline plus an invalid listing cap could trap commits for years | Fire window ≤ 7 days; listing cap validated; a refused listing no longer blocks the launch | `test_create_rejectsLongFireWindow`, `test_create_rejectsListingCapOverUint88`, `test_F06_refusedListing_doesNotBlockFire` |
| F07 | Medium | 1-wei commits could fill every participant slot | Minimum commit; withdrawing to zero frees the slot | `test_F07_dustCommit_refused`, `test_F07_withdrawToZero_freesTheSlot` |
| F08 | Medium | The vault's EIP-1271 signature check was unscoped, so with a 1271-aware quote the creator could sign away vault funds | EIP-1271 removed from the vault | `test_F08_noEip1271` |
| F09 | Low | A quote shortfall also blocked the token payout | Token and quote payouts decoupled | `test_F09_quoteShortfall_doesNotBlockTokens` |
| F10 | Low | Abort refunds paid from a snapshot, so a later loss reverted the last refunders | Pro-rata of the live balance | `test_F10_postAbortBurn_isSharedProRata` |
| F11 | Low | Rewards queued with no stakers went to whoever staked first | With no stakers, the stakers' leg goes to Ascend's bid (quote) and the platform basket (token) | `test_F11_noStakers_legGoesToBidAndPlatform` |
| F12 | Low | Exiting the vault left the listing set-aside to the exit target | Exit reclaims the set-aside and routes it first | `test_F12_exit_reclaimsListingSetAsideBeforeHandoff` |
| F13 | Low | The factory accepted a zero creator | Rejected | `test_create_rejectsZeroCreator` |
| F14 | Info | A one-block Ascend pause made `fire()` abort permanently | `fire()` reverts while paused; the round stays live | `test_F14_pausedLaunchpad_fireRevertsAndRoundStaysLive` |
| F15 | Info | A pre-existing escrow shortfall was spread onto later commits | Commits are refused while the escrow is short | `test_F15_commitWhileEscrowShort_refused` |
| F16 | High | **Found after the first deploy.** A caller could send `fire()` with a gas limit that starved Ascend's launch a few calls deep, while leaving enough gas to finish the abort path. That let anyone abort any round at T0. The same trick could skip the listing enrollment | The launch is guaranteed 5M gas (a buyout of the whole live curve takes 2.42M) and the enrollment 750k. A caller who sends less gets `InsufficientGas`. Redeployed | `test_F16_starvedLaunch_revertsAndRoundStaysLive`, `test_F16_starvedListing_revertsInsteadOfSkipping`, `test_fork_fullCurveBuyout_fitsUnderTheLaunchGasFloor` |

Code-level items, also fixed:

- The certificate's policy hash now covers the exit and listing settings (`test_I1_policyHash_coversExitAndListing`).
- The participant cliff plus duration is capped at 30 days (`test_create_rejectsLongParticipantLock`).
- The vault's fee pull has a gas floor before a policy change or an exit.
- A queued exit or listing can be cancelled (`test_I5_cancelExitAndListing_andCapBound`).
- A revoked attestor's vouchers stop working in live rounds (`test_I6_revokedAttestor_refusesNewVouchers`).
- A launch that reverts aborts the round instead of freezing it until the deadline (`test_I9_launchRevert_abortsWithRefunds`).

## Why F16 slipped past the first review

`fire()` wraps Ascend's `launch` in try/catch, so that a launch that reverts becomes an abort with refunds. The usual defence against gas starvation is to check that more than 1/64 of the gas is left after the call: a call that ran out of gas leaves the caller only that 1/64.

That check doesn't work here. Ascend's launch runs four calls deep: launchpad → Infinity vault → lock callback → pool manager. Each frame keeps 1/64 of what it was given, so a launch that ran out of gas at the bottom hands the round back about 6% of what it forwarded. From the outside, that looks just like an honest revert. A fixed floor before the call is the only reliable defence.

We found F16 because `eth_estimateGas` on an anvil fork picked exactly that limit. It returned the cheapest gas limit at which `fire()` didn't revert, and at that limit the round aborted. The SDK's end-to-end test now asserts the abort reason, so a regression shows up as a failing test, not a quiet abort.

## Known limits (not fixed)

- **Donated quote after fire.** USDC sent straight to a round, outside `commit`, is used if the round aborts but stays in the round after it fires.
- **Creator attribution.** `createRound` doesn't bind the named creator to the sender, so anyone can create a round naming any address. No funds are at risk. The app labels the creator as named by the round, not as an endorsement.
- **Open mode can't stop a creator using several wallets.** In Open mode, the creator cap and the creator's vesting bind only the creator's own wallet. Verified mode makes them meaningful, one identity per wallet. The round page says which mode a round runs in.
- **The attestor is a trusted signer.** Verified mode relies on a key we run. It is published, revocable, and explains every refusal with evidence. Creators who don't want to rely on it use Open mode.
- **Testnet quote.** Ascend's testnet USDC can be minted and burned by anyone. The contracts stay solvent under that (see F03, F10, F15), but a burn can shrink a refund. Mainnet USDC has no such function.

## Reporting

Please open a GitHub issue marked `security`, or contact the maintainer listed on the GitHub profile.
