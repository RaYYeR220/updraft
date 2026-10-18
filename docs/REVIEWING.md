# Reviewing Updraft in five minutes

## 1. See a round that already happened (1 min)

Open [updraft-weld.vercel.app/rounds](https://updraft-weld.vercel.app/rounds) and pick **Updraft Rehearsal One**. The round page shows:

- four wallets, one price, the tokens pushed to each wallet
- the vault holding Ascend's creator role
- the launch certificate

To check the same thing on the explorer, open the fire transaction [0xffadb38c…](https://elysium.kinetiq.xyz/testnet-explorer/tx/0xffadb38c47316841caca42c2244e9bfe07c9efc5b9cf6bf0909158158deb78a2). It contains, in one transaction:

1. Ascend's `Launched`, with the round as the dev-buyer
2. `BidFunded` (the 1% fee parity)
3. the creator-role handoff to the vault
4. the certificate write

## 2. See what a sniper gets (1 min)

The round **Updraft Sniper Test** fired, and a bot's pre-signed 100 USDC buy landed one second later. Ascend's launch fee was still 72.2%. The batch got 5.13× more tokens per USDC. Transactions: [PROOF.md](PROOF.md#the-sniper-comparison).

[/bottom-of-curve](https://updraft-weld.vercel.app/bottom-of-curve) has the numbers for every launch on Ascend's testnet so far.

## 3. Join or run a round yourself (2 min)

No wallet or setup is needed.

1. **Connect → "Try with a demo wallet".** The app creates a throwaway wallet in your browser and funds it with 5,000 test USDC and a little HYPE for gas. A browser wallet on Elysium testnet also works (chain 99801, RPC `https://testnet-rpc.elysium.kinetiq.xyz`).
2. **Open a live round and commit.** It takes one signature: a permit plus the commit. The preview shows what everyone pays if the round fired now.
3. **Or start a round in `/studio`.** Choose short windows. The studio shows the token's address, and what it would buy, before you sign.
4. **Fire after close.** Anyone can send the transaction, including you. The keeper will also fire it.

## 4. Read the code that matters (1 min)

| File | Why |
|---|---|
| `contracts/src/UpdraftRound.sol` → `fire()` | The whole launch in one function: preflight, launch, fee parity, vault handoff, platform cut, certificate |
| `contracts/src/lens/CurveLens.sol` | Ascend's curve, replicated to the wei, so `minDevOut` can be exact |
| `contracts/src/CreatorVault.sol` → `queuePolicy` / `executePolicy` | Bounded, timelocked fee policy |
| `contracts/test/fork/RoundFire.fork.t.sol` | The full flow against the live Ascend launchpad |
| `docs/SECURITY.md` → F16, F17 | Two ways a caller could end a round by making its launch fail, why the textbook defence missed them, and the fix that closes the class |

## Run the tests

```sh
pnpm install
cd contracts && forge test          # 136, fork tests included
cd .. && pnpm -r test               # API, keeper, MCP, analysis, widget, SDK end to end
```
