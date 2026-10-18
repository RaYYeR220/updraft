# SDK and widget

## `@updraft/sdk`

A TypeScript SDK built on viem 2. It contains:

- the chain definition for Elysium testnet (99801)
- the deployed addresses
- every contract ABI
- one client for the whole flow

```ts
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { createUpdraftClient, elysiumTestnet, elysiumTestnetDeployment, type Deployment } from "@updraft/sdk";

const publicClient = createPublicClient({ chain: elysiumTestnet, transport: http() });
const walletClient = createWalletClient({ chain: elysiumTestnet, transport: custom(window.ethereum) });

const updraft = createUpdraftClient({
  publicClient,
  walletClient,                        // optional for reads
  deployment: elysiumTestnetDeployment as Deployment,
  apiUrl: "https://updraft-api-494617981995.us-central1.run.app", // for Verified rounds
});
```

### Reads

```ts
const rounds = await updraft.listRounds();               // every round the factory created
const r = await updraft.getRound(round);                  // config, windows, totals, status, fired data
const preview = await updraft.previewFire(round);         // tokens out and price if it fired now
const mine = await updraft.previewCommit(round, 250_000_000n); // the same, if you added 250 USDC
const { tokens, refund } = await updraft.claimable(round, wallet);
const cert = await updraft.getCertificate(token);
await updraft.isRound(address);                           // was it created by the factory?
```

`predictRound(salt, deployer)` and `predictToken({ launchpad, round, tokenSalt, name, symbol })` compute addresses offline, the same way the factory and Ascend do.

### Commit

```ts
// Open round: permit and commit in one transaction when the allowance is short
await updraft.commit(round, 250_000_000n);

// Verified round: ask the attestor first; a refusal carries its reason and evidence
const a = await updraft.attest({ round, wallet, hlAccount, linkSignature });
if (a.ok) await updraft.commit(round, 250_000_000n, a);
else console.log(a.reason, a.evidence);

await updraft.withdraw(round, 50_000_000n); // until the lock
```

### Fire and after

Anyone can send these:

```ts
await updraft.fire(round);
await updraft.distribute(round, 0n, 50n); // push tokens and refunds to participants [0, 50)
await updraft.claim(round);               // vested remainder, or anything not yet pushed
await updraft.abort(round);               // when the round can't launch
await updraft.refundAborted(round);
```

### Create a round

```ts
await updraft.createRound(
  {
    launchpad, quote, name, symbol, tokenSalt, creator,
    mode: Mode.Open, attestor: zeroAddress,
    windows: { openAt, lockAt, closeAt, fireBy },
    raise: { minRaise, maxRaise, walletCap, creatorCap, minCommit },
    participantVesting: { tgeBps: 10_000, cliff: 0, duration: 0 },
    creatorVesting: { tgeBps: 0, cliff: 86_400, duration: 604_800 },
    policy: { platformBps: 1000, bidBps: 3000, stakersBps: 3000, teamBps: 3000 },
    bounds: { min: {...}, max: {...}, timelock: 259_200 },
    listingCap: 0n,
    exitEnabled: false,
  },
  roundSalt,
);
```

The factory validates all of this against Ascend's live state and reverts with a named error otherwise. The studio in the app builds the same config with a form.

### Vaults and $DRAFT

```ts
await updraft.harvest(vault);
await updraft.stake(vault, amount);       // stake the launched token in its vault
await updraft.claimRewards(vault);
await updraft.vaultEarned(vault, user);
await updraft.queuePolicy(vault, policy); // creator only, within bounds
await updraft.executePolicy(vault);       // anyone, after the timelock
await updraft.pendingPolicy(vault);

await updraft.stakeDraft(amount);         // $DRAFT staking for the platform basket
```

$DRAFT rewards are claimed with a Merkle proof. `GET /epochs/claims/:account` on the API returns every claim and proof for an account.

### Tests

`pnpm --filter @updraft/sdk test` starts an anvil fork of Elysium at a pinned block, deploys Updraft with the real deploy script, and runs a round end to end through the SDK:

- commits through both the allowance and the permit path
- fire with an estimated gas limit
- distribute, and a check that every wallet got the same price

## Widget

Embeds a live round on any page:

```html
<script src="https://updraft-weld.vercel.app/updraft-widget.js" data-round="0xROUND"></script>
```

The script inserts an iframe of the app's `/embed/round/0xROUND` page right after itself. The embed reports its height, and the widget accepts that message only from its own frame and origin. The bundle is under 1 KB with no dependencies. `data-app` points the widget at another deployment of the app.
