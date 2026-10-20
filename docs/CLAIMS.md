# Claims

Every claim Updraft makes, and how far it is proven.

| Level | Meaning |
|---|---|
| **Live** | It happened on Elysium testnet, and the transaction is linked in [PROOF.md](PROOF.md) |
| **Tested** | A test in this repo pins it. Fork tests run against the live Ascend contracts at a pinned block |
| **Reproducible** | Derived from public chain data by a script in this repo, which you can rerun |
| **Design** | The contracts work this way, but nobody has exercised it at scale yet |
| **Roadmap** | Not built. It depends on something outside our control |

## Mechanism

| Claim | Level | Evidence |
|---|---|---|
| A round's whole pot goes through Ascend's launch as one fee-free buy, at one average price for every wallet | Live, Tested | Rehearsal One `fire`; `test_fork_fullRound_onLiveAscend` |
| The token's address is known before launch | Live, Tested | The round stores `expectedToken` at creation; `TokenAddress.t.sol` matches a live launch |
| The price preview equals Ascend's actual launch output to the wei | Tested | `test_preview_equalsActualDevBuy_fuzzOverSizes` (ten live launches, both orderings) |
| A buyer right after fire gets fewer tokens per USDC than the batch | Live, Tested | [Sniper run](PROOF.md#the-sniper-comparison): 5.13× at 1 s after fire (2.26× at 2 s on an earlier deployment); same block on a fork: `test_fork_sniperAfterFire_paysTaxAndHigherPrice` |
| Tokens are pushed to wallets right after fire, and oversubscription is refunded pro-rata | Live, Tested | Rehearsal `distribute`; `test_distribute_chunks_pushAll_noDoublePay`, `test_fire_overMaxRaise_scalesAndRefunds` |
| The dev's own share vests in public (cliff + linear) and can't be claimed early | Live, Tested | [Refusals](PROOF.md#refusals): early claim reverts `NothingToClaim()`; `test_creator_cannotClaimBeforeCliff`, `test_creator_linearAfterCliff`, `test_create_rejectsWeakCreatorVesting` |
| Ascend's creator role is held by a fee vault from the launch transaction on | Live, Tested | Rehearsal `fire`; the vault is the pool's creator on-chain |
| Fee-policy changes stay inside bounds fixed at launch and wait out a timelock | Live, Tested | [Refusals](PROOF.md#refusals): `OutOfBounds()`, then `TooEarly()`, then applied; `test_policy_outOfBounds_reverts`, `test_policy_beforeTimelock_reverts`, `test_platformBps_isImmutable` |
| 1% of every batch goes to Ascend's own bid ("fee parity") | Live, Tested | Rehearsal `fire` (`BidFunded`); `test_fork_fullRound_onLiveAscend` |
| Every launch writes a certificate: participants, top-1 / top-10 concentration, creator vesting, policy hash, shortfall | Live, Tested | `GET /certificates/:token`; `test_certificate_recordsTop10AndCounts`, `Certificate.t.sol` (write once, only by its round) |
| A round that can't launch aborts and refunds pro-rata | Live, Tested | [Refusals](PROOF.md#refusals): below-minimum abort and full refund; `test_fire_belowMinimum_aborts`, `test_fire_whenCurveChanged_aborts`, `test_I9_launchRevert_abortsWithRefunds`, `test_F10_postAbortBurn_isSharedProRata` |
| Nobody can end a round by making its launch fail (starved gas, a held Infinity lock): a failed launch reverts `fire()` and the round stays live | Tested | `test_F17_*`, `test_fork_fireInsideAForeignLock_revertsAndTheRoundStaysLive` (live Ascend); [SECURITY.md](SECURITY.md#what-f16-and-f17-taught-us) |
| Verified rounds cap one wallet per Hyperliquid account, with published rules and refusals that come with evidence | Tested | `RoundVerified.t.sol`; API attestor tests; rules at `GET /rules/v1` |
| $DRAFT stakers earn the platform basket by epoch; principal can never be frozen | Live, Tested | [$DRAFT and epoch 0](PROOF.md#draft-updrafts-own-launch-and-the-first-staking-epoch): stake, epoch posted by the API job, eight assets claimed (one staker, our test wallet); `UpdraftStaking.t.sol`; API `epochs` tests |

## Data

| Claim | Level | Evidence |
|---|---|---|
| Of 251 Ascend testnet launches up to block 11,040,000: 49 had a dev-buy, 33 gave the creator side more than 20% of supply in the first minute, the worst case 98.3% | Reproducible | `services/analysis`; [ANALYSIS.md](ANALYSIS.md) |
| After the biggest dev-buys, the next token cost up to 12.8× the dev's average price | Reproducible | Same |

These are testnet numbers. Much of the activity is test traffic, including Ascend's own. They show what the mechanism allows: whoever writes the dev-buy owns the bottom of the curve. They are not a measure of mainnet behaviour.

## Not claimed

- **Mainnet.** Ascend is on testnet, so Updraft is too. Mainnet comes when Ascend's mainnet exists.
- **A third-party audit.** We reviewed our own contracts ([SECURITY.md](SECURITY.md)). No one else has.
- **Partnerships.** Nothing here implies one with Ascend, Kinetiq or Hyperliquid.
- **Buy support at T0.** Fee parity funds Ascend's bid, but Ascend's bid fills only near a 10-minute price average. After a large batch it can take a while before the bid can fill.
- **Ascend reading the certificate.** Today nothing in Ascend's contracts reads it. That it could serve as an input to Ascend's own checks is a proposal.

## Limits

| Limit | What it costs | Plan |
|---|---|---|
| The Verified-mode attestor is a signer we run | Verified rounds trust its key (published, revocable). Open mode doesn't use it | Read identity tiers from HyperCore on Elysium once that precompile ships |
| Open mode can't stop a creator committing from several wallets | The creator cap and creator vesting bind only the creator's own wallet in Open mode | Use Verified mode where it matters; the round page shows the mode |
| `createRound` doesn't authenticate the named creator | Anyone can create a round naming any address; no funds at risk | The app shows the creator as named by the round, not as an endorsement |
| Ascend's testnet USDC can be minted and burned by anyone | A burn can shrink refunds. The contracts stay solvent (they account by balance) | None needed on mainnet USDC |
| Token art and metadata | Ascend treats the creator role as the authority for token art, and on Updraft that role is a contract | Open question to Ascend |
| USDC sent straight to a round after it fires stays there | Donations only. Commits are never affected | Documented |
