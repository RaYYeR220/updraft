# Proof

Everything on this page happened on Elysium testnet (chain 99801), against the real Ascend launchpad [0x6d01…bF3d](https://elysium.kinetiq.xyz/testnet-explorer/address/0x6d01f6644bbf1b5074472D3e85aa1465B4d2bF3d). Every hash links to the Blockscout explorer.

The quote asset is Ascend's testnet Mock USDC, [0x84Cc…cFE2](https://elysium.kinetiq.xyz/testnet-explorer/address/0x84Cc00D13173f7016Bbab22A736dBf75A154cFE2), the asset Ascend allows on testnet. The rounds below are **rehearsals**: we funded fresh wallets and ran them ourselves, end to end, with `services/keeper/scripts/rehearsal.ts`.

## Deployment

Block 11,109,423. All contracts are verified on Blockscout.

| Step | Transaction |
|---|---|
| Deploy LaunchCertificate | [0x002e31a5…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x002e31a5da19b1c261d7cd4629fee5195f9e9bde1b35502a7ad5e0a34ead9b8b) |
| Deploy UpdraftStaking | [0x00effe3a…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x00effe3a934c2052b72126615b0335105bbd1595b025ddbe616e7ca5cc882e37) |
| Deploy UpdraftRound implementation | [0x27fac3c1…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x27fac3c1b244aea702c6ffbdd05cd8162c2e1ed788d58748deef36caa7df915d) |
| Deploy CreatorVault implementation | [0xa46a8817…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0xa46a8817d4ec42edc475d99813bbfc6d3222b516623f892bbd5cbf6b08e4ba56) |
| Deploy UpdraftFactory | [0x4561bd5a…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x4561bd5a7548f48e18a5e4a90c996cb8e8962f7ddf877036728b19e68733c04a) |
| Bind the certificate registry to the factory | [0x04ad1fa5…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x04ad1fa5cd635c844e3f1d9c1b9896ec2b3ed080ab33bf3a9422eda181ea892f) |
| Allow Ascend's launchpad, pinned to Ascend's owner and token bytecode | [0x9f4163af…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x9f4163afa2f5c1e9f9a11b0b8c71220614ac7926813e39b782b66086b2dfb539) |
| Allow the Verified-mode attestor | [0x3c212b8c…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x3c212b8ca53fd193e4c799acb26659c359a37b181461c48ff40bf9cbd4b294bb) |
| Set the $DRAFT epoch distributor | [0x1d25be06…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x1d25be06e0de4c75e03db43d242d12f413e19236217b40768cd1d0db5a16e483) |
| Deploy UpdraftLens | [0x36b85491…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x36b85491e012bf88b546de99b9ab3f3f4269e3238336071f8d541a53dd4d9ea9) |

**Earlier deployment.** There was a first deployment at block 11,068,309, with factory [0x312c…2168](https://elysium.kinetiq.xyz/testnet-explorer/address/0x312c860E09e9B74AAEa56a8CE7a3E617ADcD2168). We retired it after our own end-to-end test found that a `fire()` sent with a deliberately low gas limit could abort a round instead of launching it (F16 in [SECURITY.md](SECURITY.md)). The fix went in with a regression test, and the stack above was deployed with it. The rounds on the old factory are still on-chain but are no longer indexed.

## Rehearsal One: a full round

Round [0xD4d5…bDF6](https://elysium.kinetiq.xyz/testnet-explorer/address/0xD4d5F75D7abDEb644586721870fE4cf92F28bDF6). Token REH1, [0x9B63…02Bb](https://elysium.kinetiq.xyz/testnet-explorer/address/0x9B63bca41cd75A4471bea8CFEad882c11f1702Bb). Vault [0xCd90…C2c3](https://elysium.kinetiq.xyz/testnet-explorer/address/0xCd90072d8eEDa8C89639c5019ED104043b7BC2c3).

Four fresh wallets committed 150, 250, 400 and 600 USDC, each with a one-transaction permit. At close, one `fire()` launched the token on Ascend and spent all 1,400 USDC:

- 1,386 USDC went in as Ascend's fee-free launch buy.
- 14 USDC (1%) went to Ascend's own bid.

The buy returned 133,804,035 REH1, 13.4% of supply. 0.5% went to the $DRAFT basket. The rest was pushed to the four wallets pro-rata in one `distribute()`, so every wallet paid the same $0.00001052 per token. In the same transaction, Ascend's creator role moved to the round's fee vault.

| Step | Transaction |
|---|---|
| Create the round | [0x7800d4ea…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x7800d4eaf248f1b605b853a3af972113613d960f5ebb4e44cf85c31798b79206) |
| Commit 150 USDC (permit) | [0x3d8e39e9…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x3d8e39e94581c3e90ba6829c360f4144e656a08b1c252772f7bca7623fd297f7) |
| Commit 250 USDC (permit) | [0x42defe50…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x42defe50a489df1334baac7f3eae93c51d7bc17a1aa4291cd6234202cf70ca1a) |
| Commit 400 USDC (permit) | [0x6eb0229a…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x6eb0229aca3845e61497d7178bf31b443b3dcd9e1ff8309d6d2164612f984729) |
| Commit 600 USDC (permit) | [0xf02732a5…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0xf02732a5dc979ece09400fb23126c58279caa748917664a4d8e453752e1c9e9c) |
| **Fire**: Ascend launch, fee parity, vault handoff, certificate | [0xa469e88e…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0xa469e88e9217bbf8f01b06eac27bf987c86af418db9b7fc9cbda16221469c1fe) |
| Distribute to all four wallets | [0xd5094d2b…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0xd5094d2b8c3a86746c5be824a6ee80a60c7ade2e414d6667cced04a10ff21133) |

## The sniper comparison

Two rounds of 2,000 USDC (300 + 700 + 1,000) each, with a sniper wallet ready before T0. The sniper signs its 100 USDC buy in advance, because the token address is known before launch, and broadcasts it the moment `fire()` lands, the way a bot would. We read the fee at the sniper's own block.

| | Run 1 | Run 2 |
|---|---|---|
| Round | [0xEf4f…CE8c](https://elysium.kinetiq.xyz/testnet-explorer/address/0xEf4f1b9E58bDAbDEf9b157A1EA1375fE699FCE8c) | [0x4803…c9ad](https://elysium.kinetiq.xyz/testnet-explorer/address/0x48035d0EC17d0938ee6266C7fF476743779Cc9ad) |
| Fire | [0x24043fd3…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x24043fd3b9abbb09c0eca4c1690c9689444114fb182f8ecde954277cc61fb356) | [0xf5db90c4…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0xf5db90c4eca811a53a6d9f1f2bef8735b7d4614d93ebe9269b7e689996b8cde5) |
| Sniper's buy | [0x47985359…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x479853592711081d62541df87ece0f91ca69e2630ef0a613c87752880d3a0799), 1 s (9 blocks) after fire | [0xd4037316…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0xd403731698a9f2a9fc6c5536ef0128c408c28b2d812f0ec60f86ad0ffc72469d), 2 s after fire, sent without pre-signing |
| Ascend's launch fee in that block | 72.2% | 54.4% |
| Batch: tokens per USDC | 86,359 | 86,359 |
| Sniper: tokens per USDC | 16,835 | 38,184 |
| **Batch advantage** | **5.13×** | **2.26×** |

The batch's tokens-per-USDC figure is after the 1% fee parity and the 0.5% platform cut. The two runs give exactly the same batch figure, because Ascend's curve is deterministic and our lens predicts it to the wei.

Ascend's launch fee decays from 90% to 1% over five seconds, so a sniper who lands later pays less fee. Even then, it pays the marginal price above the batch's average. A buy in the same block as fire pays the full 90%; the fork test `test_fork_sniperAfterFire_paysTaxAndHigherPrice` pins that case.

## Refusals

These transactions show what the contracts refuse. Each one was mined on purpose, with a fixed gas limit, so it stays on the record. Blockscout decodes the reason.

Script: `services/keeper/scripts/refusals.ts`.

**A round under its minimum aborts, and everyone is refunded in full.** Round [0xcE36…24e1](https://elysium.kinetiq.xyz/testnet-explorer/address/0xcE3677be19F6a523e73c94E2143Ab98412B624e1) needed 1,000 USDC and got 100.

| Step | Transaction |
|---|---|
| Commit 100 USDC | [0x35f051f8…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x35f051f89ba97a8f7524f229f8a9afaed05ee3c8e06cef8a8a651f6c00ef04f0) |
| Fire at close, sent by our keeper: the round aborts with reason `below-minimum` | [0x49a78ee9…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x49a78ee962c7a0bc1fe3f0c4df3c72995d1979fbce4b2e238f321a007f5ed907) |
| Refund: the wallet holds its 100 USDC again | [0xda82d536…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0xda82d5364ae18b6af382ea8e900a503e85334b5108648363a794086f59f13cee) |

**The creator can't take their own tokens before the cliff.** In round [0xe052…95Ab](https://elysium.kinetiq.xyz/testnet-explorer/address/0xe052b3ebbd017b74661D06cf0E7ebC79a2aC95Ab), the creator committed 200 USDC next to a 300 USDC participant, with a 10-minute cliff.

| Step | Transaction |
|---|---|
| Fire | [0x9551950b…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x9551950b8f831d75501cb2839a7eaa93fbff82d74a93e6967be83ee006fa513f) |
| Creator claims right after: **reverts `NothingToClaim()`** | [0xb0b89727…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0xb0b89727b6878503c28402717fcf21bbee9722125e58628c904f736e1f9daa3b) |

**Fee policy moves only inside the launch bounds, and only after the timelock.** These were sent to the vault of Rehearsal One, [0xCd90…C2c3](https://elysium.kinetiq.xyz/testnet-explorer/address/0xCd90072d8eEDa8C89639c5019ED104043b7BC2c3). Its bounds cap the team share at 60%, with a 5-minute timelock.

| Step | Transaction |
|---|---|
| Queue a split with the team at 80%: **reverts `OutOfBounds()`** | [0xdad13bd0…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0xdad13bd0188fefd8f38d02cceb9afc183040d08b5f32148f75631230410e7b8b) |
| Queue an in-bounds split: bid 20%, stakers 40%, team 30%, platform 10% | [0xcf55192d…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0xcf55192d950c0f63bf47965954c74d9f7d9da3745bc4ef082052c7f7228309df) |
| Execute it at once: **reverts `TooEarly()`** | [0xc6168563…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0xc6168563223199c1182be799470f7c205e6478fa6f3131fff90fa89b47921884) |
| Execute it after the timelock: applies | [0x729716cd…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0x729716cdc273309b0b26aa3784df7bbc94173224aea5cd63b9e1fae2eb839000) |

## Tests

| Suite | Count | Command |
|---|---|---|
| Contracts: unit, invariant, and fork against the live launchpad at a pinned block | 136 | `cd contracts && forge test` |
| API: attestor, Hyperliquid rules, evidence, epochs | 27 | `pnpm --filter @updraft/api test` |
| Keeper | 10 | `pnpm --filter @updraft/keeper test` |
| MCP | 9 | `pnpm --filter @updraft/mcp test` |
| Analysis | 4 | `pnpm --filter @updraft/analysis test` |
| Widget | 4 | `pnpm --filter @updraft/widget test` |
| SDK, end to end on an anvil fork of Elysium with the real deploy script | 2 | `pnpm --filter @updraft/sdk test` |

The fork tests run the real Ascend launchpad, not a stand-in:

- `CurveLens.t.sol`: the lens's preview equals Ascend's actual launch output, to the wei. The test covers ten launches from 1 to 45,000 USDC, both token orderings, and Ascend's RWA quote.
- `RoundFire.fork.t.sol`: a full round on live Ascend. The vault takes the creator role, fee parity reaches Ascend's bid, the certificate is written, and a sniper gets under a tenth of the batch's tokens per dollar in the same block. It also checks that a buyout of the whole curve fits inside the launch's gas guarantee.
- `AscendBindings.t.sol`: our interfaces decode the live launchpad, and a raw launch sends its dev-buy to the named creator, as the design relies on.

## Check it yourself

```sh
RPC=https://testnet-rpc.elysium.kinetiq.xyz
ROUND=0xD4d5F75D7abDEb644586721870fE4cf92F28bDF6

cast call $ROUND "status()(uint8)" --rpc-url $RPC              # 1 = fired
cast call $ROUND "token()(address)" --rpc-url $RPC
cast call $ROUND "quoteUsed()(uint256)" --rpc-url $RPC
cast call $ROUND "vault()(address)" --rpc-url $RPC
```

The indexer serves the same data as JSON:

- the round: `GET /rounds/0xD4d5F75D7abDEb644586721870fE4cf92F28bDF6`
- the launch certificate: `GET /certificates/0x9B63bca41cd75A4471bea8CFEad882c11f1702Bb`

On-chain, the certificate is `LaunchCertificate.get(token)`.
