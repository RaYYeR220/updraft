import type { Address, Hex } from "viem";
import { type StakeEvent, buildEpoch } from "./epochs.js";
import type { Store } from "./store.js";

/** What the epoch job reads from and writes to the chain. */
export interface EpochChain {
  stakeEvents(): Promise<StakeEvent[]>;
  /** Assets deposited by Updraft rounds and their vaults (deposits from anyone else are ignored). */
  depositedAssets(): Promise<Address[]>;
  available(asset: Address): Promise<bigint>;
  /** Start of the next epoch: genesis, or the previous epoch's end. */
  nextStart(): Promise<number>;
  epochCount(): Promise<number>;
  latestTimestamp(): Promise<number>;
  post(root: Hex, end: number, assets: Address[], amounts: bigint[], uri: string): Promise<Hex>;
}

export interface EpochJobDeps {
  chain: EpochChain;
  store: Store;
  publicApi: string;
  minWindowSec?: number;
}

/**
 * Closes the next epoch: time-weighted stake over [start, now), every basket asset split by it,
 * the tree stored for claimants and its root posted on chain. Returns null when there is nothing to do.
 */
export async function runEpoch({ chain, store, publicApi, minWindowSec = 3600 }: EpochJobDeps) {
  const start = await chain.nextStart();
  const end = (await chain.latestTimestamp()) - 30;
  if (end - start < minWindowSec) return null;

  const assets: { asset: Address; amount: bigint }[] = [];
  for (const asset of await chain.depositedAssets()) {
    const amount = await chain.available(asset);
    if (amount > 0n) assets.push({ asset, amount });
  }
  const epoch = buildEpoch(await chain.stakeEvents(), start, end, assets);
  const id = await chain.epochCount();
  const uri = `${publicApi}/epochs/${id}`;
  const tx = await chain.post(
    epoch.root,
    end,
    epoch.totals.map((t) => t.asset),
    epoch.totals.map((t) => t.amount),
    uri,
  );
  await store.putEpoch({
    id,
    start,
    end,
    root: epoch.root,
    tx,
    claims: JSON.stringify(epoch.claims.map((c) => ({ ...c, amount: c.amount.toString() }))),
    tree: epoch.tree ? JSON.stringify(epoch.tree, (_k, v) => (typeof v === "bigint" ? v.toString() : v)) : null,
  });
  return { id, start, end, root: epoch.root, tx, claims: epoch.claims.length, totals: epoch.totals };
}
