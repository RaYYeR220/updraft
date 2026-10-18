import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import type { Address, Hex } from "viem";

/** A stake balance change: `balance` is the user's staked amount after the event. */
export interface StakeEvent {
  user: Address;
  balance: bigint;
  time: number;
}

export interface EpochClaim {
  account: string;
  asset: Address;
  amount: bigint;
  proof: string[];
}

export interface Epoch {
  start: number;
  end: number;
  root: Hex;
  tree: ReturnType<StandardMerkleTree<[string, string, bigint]>["dump"]> | null;
  claims: EpochClaim[];
  totals: { asset: Address; amount: bigint }[];
}

export const LEAF_ENCODING = ["address", "address", "uint256"];

/**
 * Stake × seconds held inside [start, end). A stake that is added and removed in the same second
 * earns nothing, so joining around a deposit can't capture it.
 */
export function timeWeights(events: StakeEvent[], start: number, end: number): Map<string, bigint> {
  const sorted = [...events].sort((a, b) => a.time - b.time);
  const balance = new Map<string, bigint>();
  const since = new Map<string, number>();
  const weight = new Map<string, bigint>();

  for (const e of sorted) {
    const u = e.user.toLowerCase();
    if (e.time <= start) {
      balance.set(u, e.balance);
      since.set(u, start);
      continue;
    }
    if (e.time >= end) break;
    const held = balance.get(u) ?? 0n;
    weight.set(u, (weight.get(u) ?? 0n) + held * BigInt(e.time - (since.get(u) ?? start)));
    balance.set(u, e.balance);
    since.set(u, e.time);
  }
  for (const [u, b] of balance) {
    weight.set(u, (weight.get(u) ?? 0n) + b * BigInt(end - (since.get(u) ?? start)));
  }
  for (const [u, w] of weight) if (w === 0n) weight.delete(u);
  return weight;
}

/** Splits each asset by time-weighted stake and builds the Merkle tree UpdraftStaking verifies. */
export function buildEpoch(events: StakeEvent[], start: number, end: number, assets: { asset: Address; amount: bigint }[]): Epoch {
  const weights = timeWeights(events, start, end);
  const total = [...weights.values()].reduce((s, w) => s + w, 0n);
  const values: [string, string, bigint][] = [];
  const totals: { asset: Address; amount: bigint }[] = [];
  if (total > 0n) {
    for (const { asset, amount } of assets) {
      let sum = 0n;
      for (const [account, w] of weights) {
        const share = (amount * w) / total;
        if (share === 0n) continue;
        values.push([account, asset, share]);
        sum += share;
      }
      if (sum > 0n) totals.push({ asset, amount: sum });
    }
  }
  if (values.length === 0) {
    return { start, end, root: `0x${"00".repeat(32)}`, tree: null, claims: [], totals: [] };
  }
  const tree = StandardMerkleTree.of(values, LEAF_ENCODING);
  const claims = values.map((v, i) => ({ account: v[0], asset: v[1] as Address, amount: v[2], proof: tree.getProof(i) }));
  return { start, end, root: tree.root as Hex, tree: tree.dump(), claims, totals };
}
