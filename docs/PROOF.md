# Proof

Everything on this page happened on Elysium testnet (chain 99801), against the real Ascend launchpad [0x6d01…bF3d](https://elysium.kinetiq.xyz/testnet-explorer/address/0x6d01f6644bbf1b5074472D3e85aa1465B4d2bF3d). Every hash links to the Blockscout explorer.

The quote asset is Ascend's testnet Mock USDC, [0x84Cc…cFE2](https://elysium.kinetiq.xyz/testnet-explorer/address/0x84Cc00D13173f7016Bbab22A736dBf75A154cFE2), the asset Ascend allows on testnet. The rounds below are **rehearsals**: we funded fresh wallets and ran them ourselves, end to end, with `services/keeper/scripts/rehearsal.ts`.

## Deployment

Block 11,174,917. All contracts are verified on Blockscout.

| Step | Transaction |
|---|---|
| Deploy LaunchCertificate | [0x288dd67a…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x288dd67a481f4d6e71158f29d7f0d05576a1ae63d8e5d659c975e97844196b90) |
| Deploy UpdraftStaking | [0xff114cf2…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0xff114cf24d9c3ce220b6458730255e9a228a66734f7000bf2d2e342a9dc2936d) |
| Deploy UpdraftRound implementation | [0xe1ed61fc…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0xe1ed61fc29fbe75fd9247e2626a8629135643ccc62be45994b9e0ad23441ed7c) |
| Deploy CreatorVault implementation | [0x98fffd10…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x98fffd10b9fe8dfdb3a6a194ed895b6e306f52b45f966de3ee6e37f28972e016) |
| Deploy UpdraftFactory | [0xfaac71be…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0xfaac71beea4fd0cb1f773af3439845f3ed2b8c60c6813e01bfc1ca6c35dbb888) |
| Bind the certificate registry to the factory | [0x648ce223…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x648ce223fa64427fa3693eea970495d7a2cf5969eee1cf48d57346abe60dd62a) |
| Allow Ascend's launchpad, pinned to Ascend's owner and token bytecode | [0xb91ef354…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0xb91ef3546090768ff6678e93403348c106996bc6454f115cd55799c8ec769156) |
| Allow the Verified-mode attestor | [0x6dc2d505…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x6dc2d505590530d35c5c092f3882322131e14e48f7014c310e405c7156aa81fa) |
| Set the $DRAFT epoch distributor | [0xe583bbfa…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0xe583bbfaddc7a1d4a4e17efe2193cb8b08fd62d6d9a0993f27df6f855268048b) |
| Deploy UpdraftLens | [0x55e6ad0e…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x55e6ad0eadf1bc82e76111a2ed92f90c96a5e6350230e8ddb7389f82cba89b8a) |

**Earlier deployments.** We retired two earlier deployments after finding ways a caller could end a round by making its launch fail ([SECURITY.md](SECURITY.md#what-f16-and-f17-taught-us)):

| Deployment | Factory | Found | Fix |
|---|---|---|---|
| First, block 11,068,309 | [0x312c…2168](https://elysium.kinetiq.xyz/testnet-explorer/address/0x312c860E09e9B74AAEa56a8CE7a3E617ADcD2168) | F16: our own end-to-end test | A gas floor |
| Second, block 11,109,423 | [0xCf96…6Ddb](https://elysium.kinetiq.xyz/testnet-explorer/address/0xCf96A98DcFd86365389592b0Fa1a878086fd6Ddb) | F17 and F18: a full review before publishing | Launch failures no longer end a round at all |

Each fix came with a test that failed first. The rounds on those factories are still on-chain but are no longer indexed.

## Rehearsal One: a full round

Round [0xD5dF…5421](https://elysium.kinetiq.xyz/testnet-explorer/address/0xD5dF4e0537b171f05D415d7BDC0B6345f0815421). Token REH1, [0xc8f5…e0cA](https://elysium.kinetiq.xyz/testnet-explorer/address/0xc8f59d265A064bcB20a2F8bf3027AEA502B9e0cA). Vault [0x2A19…CE1C](https://elysium.kinetiq.xyz/testnet-explorer/address/0x2A19513Fb59f3B9E230de513A37Dd4aA0008CE1C).

Four fresh wallets committed 150, 250, 400 and 600 USDC, each with a one-transaction permit. At close, one `fire()` launched the token on Ascend and spent all 1,400 USDC:

- 1,386 USDC went in as Ascend's fee-free launch buy.
- 14 USDC (1%) went to Ascend's own bid.

The buy returned 133,804,035 REH1, 13.4% of supply. 0.5% went to the $DRAFT basket. The rest was pushed to the four wallets pro-rata in one `distribute()`, so every wallet paid the same $0.00001052 per token. In the same transaction, Ascend's creator role moved to the round's fee vault.

| Step | Transaction |
|---|---|
| Create the round | [0xa561f6d1…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0xa561f6d129212e563ff45f170a3c860815dd958384bbb6cd5165759c24ae15a4) |
| Commit 150 USDC (permit) | [0x21f49e3f…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x21f49e3f3ca5bbaa1d2cac8fc2903dfaebaf4b65b986a587a7051ae42062eaf9) |
| Commit 250 USDC (permit) | [0x0fa851c3…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x0fa851c30522c4cea0e98fc396e88feb8a23de1efe0020a20a73e514ee35d0cc) |
| Commit 400 USDC (permit) | [0x8fa4114b…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x8fa4114b8724810c14449c9aa27798d9fbad8a1aaa69facaffa3cd7b497aeb08) |
| Commit 600 USDC (permit) | [0xf5b856a6…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0xf5b856a6315709d81d6cac76680c2706c33ce7c6e235461fb75ebdb368f53908) |
| **Fire**: Ascend launch, fee parity, vault handoff, certificate | [0xffadb38c…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0xffadb38c47316841caca42c2244e9bfe07c9efc5b9cf6bf0909158158deb78a2) |
| Distribute to all four wallets | [0x639cd3c3…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x639cd3c3d602326b92339001813b074f4328d2d3e02e37659031d4c11fffd79f) |

## The sniper comparison

A round of 2,000 USDC (300 + 700 + 1,000), with a sniper wallet ready before T0. The sniper signs its 100 USDC buy in advance, because the token address is known before launch, and broadcasts it the moment `fire()` lands, the way a bot would. We read the fee at the sniper's own block.

| | |
|---|---|
| Round | [0x15f4…C03b](https://elysium.kinetiq.xyz/testnet-explorer/address/0x15f436B0D9A917179Fc5DD390072AD46Ed7aC03b) |
| Fire | [0x104a3984…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x104a3984e10147598e7a643539a106e01267d34d19cb93838c9c9182c5c66503) |
| Sniper's buy | [0x3b028ad9…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x3b028ad9898c59d434ec94e1d1ce296c6693a7fe4cb4d0b3626500351695d192), 1 s (5 blocks) after fire |
| Ascend's launch fee in that block | 72.2% |
| Batch: tokens per USDC | 86,359 |
| Sniper: tokens per USDC | 16,835 |
| **Batch advantage** | **5.13×** |

The batch's tokens-per-USDC figure is after the 1% fee parity and the 0.5% platform cut. It is identical to the figure from the same round on the earlier deployments, because Ascend's curve is deterministic and our lens predicts it to the wei.

Ascend's launch fee decays from 90% to 1% over five seconds. On an earlier deployment, a sniper that landed two seconds after fire paid 54.4% and still got 2.26× fewer tokens per USDC than the batch. A sniper later still pays less fee, but it still pays the marginal price above the batch's average. A buy in the same block as fire pays the full 90%; the fork test `test_fork_sniperAfterFire_paysTaxAndHigherPrice` pins that case.

## $DRAFT: Updraft's own launch and the first staking epoch

Round [0xA708…6bD4](https://elysium.kinetiq.xyz/testnet-explorer/address/0xA7082EaeF5e6ED1857f1545D0A5cbC7a204B6bD4). Token $DRAFT, [0xcBA4…15B3](https://elysium.kinetiq.xyz/testnet-explorer/address/0xcBA4b9c291999b46BF516231E2d6C7Ab509415B3). Vault [0xffcb…ea52](https://elysium.kinetiq.xyz/testnet-explorer/address/0xffcb54ad968b42489ecf62fd4a6bf618648aea52).

The round was public from Oct 18 to Oct 20, 12:00 UTC. No outside wallet committed. The only commit is the creator's 500 USDC, and that share vests: a 30-day cliff, then 180 days. Our keeper fired the round 6 s after close:

- 495 USDC went in as Ascend's launch buy.
- 5 USDC went to Ascend's own bid.
- The buy returned 56,337,478 $DRAFT.
- 0.5%, 281,687 $DRAFT, went to the staking basket.

| Step | Transaction |
|---|---|
| Create the round | [0x0bf0fb12…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x0bf0fb12999d6b836d6c6309ae4b11ea9c1ce409939ca55e03851adf92ec867f) |
| Creator commits 500 USDC | [0x1db8d2c5…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x1db8d2c5f7aab7a71c4f083d6330dda03ef8b60fc04137f8b02b9a5bde9a616d) |
| **Fire**: Ascend launch, fee parity, vault handoff, certificate | [0x58f16880…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x58f168806cb5834f6c4d57b9159083c4592fe4c9a75c915f9f93d457294af8ea) |

**Staking.** The steps below were all sent from the team's test wallet, [0xc6D9…8f02](https://elysium.kinetiq.xyz/testnet-explorer/address/0xc6D9588923181FBB84ACF028a85C442421828f02), so it is the only staker in this epoch.

1. We bound $DRAFT to the staking contract [0x90A3…7E6f](https://elysium.kinetiq.xyz/testnet-explorer/address/0x90A39170D14C22711dC7dDbeF1367d58cbFA7E6f).
2. 3 min 46 s after the fire, we bought 20 USDC of $DRAFT on Ascend's market. That buy paid Ascend's 1% fee and the price the batch had left behind: 101,073 $DRAFT per USDC, against the batch's 112,112.
3. We staked all of it.
4. The API's epoch job then closed epoch 0, a time-weighted Merkle tree over the whole basket. Its leaves can be recomputed from the contract's events.
5. One `claimMany` paid every allocation in full.

| Step | Transaction |
|---|---|
| Bind $DRAFT as the stake token | [0xfc93b0bc…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0xfc93b0bca5a7783e8dee9c0e2749fa683847447937305748fb19ba1647bae46a) |
| Buy 20 USDC of $DRAFT on Ascend | [0x21c5202f…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x21c5202f3559cd2e4e2783c0e91dfcc3589e9f4bfc6ceb478758e3c868a7b422) |
| Stake it | [0xf8574a35…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0xf8574a352fb4b59a10de43793ea3d0ac561d3d2fdf46c1ce31ac6890ff5a732d) |
| **Post epoch 0**: root, window, basket | [0x583aa95c…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x583aa95ce11478dbf0223a3cdb7b6d1e380bc6a66b150257de0fc5f280367d7b) |
| **Claim all eight assets** | [0xe1fafe90…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0xe1fafe90e7d9c2107e6487d900ae2e5b121150ef954d2eeaba3cfe6a595c631a) |

The basket epoch 0 paid out holds the platform's share of every round fired on this deployment, plus the creator fees the vaults harvested:

| Asset | Paid |
|---|---|
| REH1 | 669,020 |
| SNIPE | 867,926 |
| VEST | 281,687 |
| DRAFT | 281,687 |
| EAEAO3 | 148,210 |
| EJ9VLA | 148,210 |
| FILM | 148,210 |
| USDC | 3.61 |

Most of it comes from rehearsal and test rounds. EAEAO3 and EJ9VLA were opened by our end-to-end tests, and FILM by the demo recording.

## Refusals

These transactions show what the contracts refuse. Each one was mined on purpose, with a fixed gas limit, so it stays on the record. Blockscout decodes the reason.

Script: `services/keeper/scripts/refusals.ts`.

**A round under its minimum aborts, and everyone is refunded in full.** Round [0x8Ca3…0253](https://elysium.kinetiq.xyz/testnet-explorer/address/0x8Ca3a7451C0B32Ac0553640Ab0e7c53Ee4960253) needed 1,000 USDC and got 100.

| Step | Transaction |
|---|---|
| Commit 100 USDC | [0x328993a7…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x328993a7ba2fefd5ade4c53e762001563e2c570f2bcde4cba693effa7f742f3d) |
| Fire at close: the round aborts with reason `below-minimum` | [0x406a1311…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x406a1311953e21e74fd9c761d204bb259adb3bc1d2607406f4ec82260f8d1ca3) |
| Refund: the wallet holds its 100 USDC again | [0x32f8b34e…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x32f8b34edae665c6a172012711f150aa8574d0c642aef5c0aec4d77787a35e58) |

**The creator can't take their own tokens before the cliff.** In round [0x4E18…C325](https://elysium.kinetiq.xyz/testnet-explorer/address/0x4E182B66B30Ccf26B3d388Ae7CE549b043A5C325), the creator committed 200 USDC next to a 300 USDC participant, with a 10-minute cliff.

| Step | Transaction |
|---|---|
| Fire | [0x994aedd6…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x994aedd6fc13aeb740a55e5e721c84cb8b0540427690b5ef3ed4c719323b8715) |
| Creator claims right after: **reverts `NothingToClaim()`** | [0x5a2283a0…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x5a2283a02af9c0c9d5796bd7541410cb968591d71ab8bbbd50cb203ec20359ac) |

**Fee policy moves only inside the launch bounds, and only after the timelock.** These were sent to the vault of Rehearsal One, [0x2A19…CE1C](https://elysium.kinetiq.xyz/testnet-explorer/address/0x2A19513Fb59f3B9E230de513A37Dd4aA0008CE1C). Its bounds cap the team share at 60%, with a 5-minute timelock.

| Step | Transaction |
|---|---|
| Queue a split with the team at 80%: **reverts `OutOfBounds()`** | [0x06410ac1…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x06410ac1b99100339063d4cb954391652532eda05bb7dd78123a151d2b3f06ba) |
| Queue an in-bounds split: bid 20%, stakers 40%, team 30%, platform 10% | [0xce094484…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0xce0944841eae24714551f909983f95f2257b845cecf94357ca22a4c1700dd4d4) |
| Execute it at once: **reverts `TooEarly()`** | [0x1bedce0a…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x1bedce0ad69dac3303835df3115c9bbdfba22a1c04119d4264dfded3bac55813) |
| Execute it after the timelock, with a hand-picked 3M gas limit: **reverts `InsufficientGas()`**. That is the F18 floor, which keeps the fee pull from being starved | [0x748105ec…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x748105ec4e60e92e05d7560d8b5b8c08559af236572f243fab499be6b82b9141) |
| Execute it with an estimated gas limit: applies | [0x9d6f3466…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x9d6f3466f60f5f6bf775921a87770d4df4c7cddb8c30cd6e3b0d6dbf833526c9) |

## Tests

| Suite | Count | Command |
|---|---|---|
| Contracts: unit, invariant, and fork against the live launchpad at a pinned block | 142 | `cd contracts && forge test` |
| API: attestor, Hyperliquid rules, evidence, epochs, drip | 35 | `pnpm --filter @updraft/api test` |
| Keeper | 10 | `pnpm --filter @updraft/keeper test` |
| MCP | 14 | `pnpm --filter @updraft/mcp test` |
| Analysis | 4 | `pnpm --filter @updraft/analysis test` |
| Widget | 4 | `pnpm --filter @updraft/widget test` |
| SDK: permit domains, plus end to end on an anvil fork of Elysium with the real deploy script | 5 | `pnpm --filter @updraft/sdk test` |
| Web, against the live app: every page on desktop and mobile, plus the full visitor path below | 19 | `pnpm --filter @updraft/web test:e2e` |

The visitor path (`apps/web/e2e/judge-path.spec.ts`) uses no wallet and no setup, and nothing is mocked. It runs against the deployed app and Elysium testnet in about three minutes:

1. A demo wallet opens a two-minute round in the studio.
2. A second visitor's demo wallet commits 250 USDC with one signature.
3. Our keeper fires the round at T0.
4. The test waits until the visitor's wallet holds exactly its share of the batch.
5. It opens the launch certificate.

The fork tests run the real Ascend launchpad, not a stand-in:

- `CurveLens.t.sol`: the lens's preview equals Ascend's actual launch output, to the wei. The test covers ten launches from 1 to 45,000 USDC, both token orderings, and Ascend's RWA quote.
- `RoundFire.fork.t.sol`:
  - A full round on live Ascend. The vault takes the creator role, fee parity reaches Ascend's bid, and the certificate is written.
  - A sniper gets under a tenth of the batch's tokens per dollar in the same block.
  - Calling `fire()` or a stake from inside a held Infinity lock can't end the round or skip a fee pull.
  - A buyout of the whole curve fits in one transaction.
- `AscendBindings.t.sol`: our interfaces decode the live launchpad, and a raw launch sends its dev-buy to the named creator, as the design relies on.

## Check it yourself

```sh
RPC=https://testnet-rpc.elysium.kinetiq.xyz
ROUND=0xD5dF4e0537b171f05D415d7BDC0B6345f0815421

cast call $ROUND "status()(uint8)" --rpc-url $RPC              # 1 = fired
cast call $ROUND "token()(address)" --rpc-url $RPC
cast call $ROUND "quoteUsed()(uint256)" --rpc-url $RPC
cast call $ROUND "vault()(address)" --rpc-url $RPC
```

The indexer serves the same data as JSON:

- the round: `GET /rounds/0xD5dF4e0537b171f05D415d7BDC0B6345f0815421`
- the launch certificate: `GET /certificates/0xc8f59d265A064bcB20a2F8bf3027AEA502B9e0cA`

On-chain, the certificate is `LaunchCertificate.get(token)`.
