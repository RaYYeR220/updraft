# Who got the bottom of the curve?

`services/analysis` reads every launch on Ascend's testnet launchpads straight from the chain. For each launch it measures:

- who bought in the first minute
- how much of the supply they got
- at what price

The output is `services/analysis/out/bottom-of-curve.json`, also served at `GET /analysis` on the API. The app's `/bottom-of-curve` page draws it.

## Method

- **Launches.** Every `Launched` event on all four Ascend testnet launchpads, up to block 11,040,000. That gives 251 launches:
  - [0xc051…01D9](https://elysium.kinetiq.xyz/testnet-explorer/address/0xc05193a68ED25df678bB7d6644D081BffDAA01D9)
  - [0xed6E…19F4](https://elysium.kinetiq.xyz/testnet-explorer/address/0xed6E0Ca8247A697CadFDB0DeaAa2D73e061719F4)
  - [0xE2f6…d8E9](https://elysium.kinetiq.xyz/testnet-explorer/address/0xE2f6254508DEB93Da081837F545e0bAF7b00d8E9)
  - [0x6d01…bF3d](https://elysium.kinetiq.xyz/testnet-explorer/address/0x6d01f6644bbf1b5074472D3e85aa1465B4d2bF3d)
- **Buys.** Pool-manager `Swap` events on each launch's pool in the 60 seconds after launch, where the trader receives the token and pays the quote. The buyer is the transaction's sender.
- **Insiders.** The dev-buy, plus buys in the window by:
  - the creator
  - the launch transaction's sender
  - any wallet whose first HYPE came from either of those (looked up on Blockscout)
- **Others.** Every other buy in the window.
- **Shares** are of the fixed 1B supply.
- **Next-buyer premium** is the marginal price right after the dev-buy, divided by the dev's average price. In other words: what the next buyer pays per token, relative to the dev.

The run is deterministic for a pinned block. Transaction senders are cached on disk, so a rerun doesn't hit the public RPC's rate limit again.

```sh
cd services/analysis
TO_BLOCK=11040000 pnpm start      # writes out/bottom-of-curve.json
pnpm test                         # classification rules
```

## Results

| | |
|---|---|
| Launches | 251 |
| With a dev-buy | 49 |
| Insiders over 5% of supply in the first minute | 46 |
| Insiders over 20% of supply in the first minute | 33 |
| Worst case | 98.3% of supply to insiders |
| Largest next-buyer premium | 12.8× the dev's average price |
| Launches with any outside buyer in the first minute | 17 |

## Reading it honestly

This is testnet. Most launches have no outside buyers at all; only 17 of 251 had one in the first minute. Many launches are tests, including Ascend's own. The median launch shows almost no insider share, because nobody bought anything.

So the numbers don't measure how people behave on mainnet. They show what the mechanism allows. Whoever writes the dev-buy sets the price everyone after them pays, and on testnet that was routinely a fifth of the supply or more, in one transaction, before anyone else could act. Updraft takes that position away from any single wallet: the dev-buy becomes everyone's.
