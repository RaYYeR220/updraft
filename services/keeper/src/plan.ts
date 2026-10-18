import type { Address } from "viem";

export interface RoundView {
  address: Address;
  /** 0 live, 1 fired, 2 aborted */
  status: 0 | 1 | 2;
  totalCommitted: bigint;
  closeAt: number;
  fireBy: number;
  participantCount: number;
  /** Next participant index this keeper has not pushed yet. */
  distributeCursor: number;
  vault: Address | null;
  lastHarvestAt: number;
}

export type Action =
  | { kind: "fire"; round: Address }
  | { kind: "abort"; round: Address }
  | { kind: "distribute"; round: Address; from: bigint; to: bigint }
  | { kind: "harvest"; round: Address; vault: Address };

export const actionKey = (a: Action) => `${a.kind}:${a.round}`;

/**
 * What to do next for each round. Everything here is permissionless on-chain; the keeper only
 * makes sure it happens on time. At most one action per round per pass.
 */
export function plan(
  rounds: RoundView[],
  nowSec: number,
  inFlight: Set<string>,
  opts: { chunk: number; harvestEverySec: number; maxActions?: number } = { chunk: 100, harvestEverySec: 1800 },
): Action[] {
  const actions: Action[] = [];
  const max = opts.maxActions ?? 10;
  // Most urgent first: live rounds by fire deadline, then fired rounds (distribution, harvest).
  const ordered = [...rounds].sort((a, b) => (a.status - b.status) || (a.fireBy - b.fireBy));
  for (const r of ordered) {
    if (actions.length >= max) break;
    // Rounds are permissionless; one nobody committed to holds nothing to fire or refund.
    if (r.totalCommitted === 0n) continue;
    if (inFlight.has(`backoff:${r.address}`)) continue;
    let next: Action | null = null;
    if (r.status === 0) {
      if (nowSec > r.fireBy) next = { kind: "abort", round: r.address };
      else if (nowSec >= r.closeAt) next = { kind: "fire", round: r.address };
    } else if (r.status === 1) {
      if (r.distributeCursor < r.participantCount) {
        const to = Math.min(r.distributeCursor + opts.chunk, r.participantCount);
        next = { kind: "distribute", round: r.address, from: BigInt(r.distributeCursor), to: BigInt(to) };
      } else if (r.vault && nowSec - r.lastHarvestAt >= opts.harvestEverySec) {
        next = { kind: "harvest", round: r.address, vault: r.vault };
      }
    }
    if (next && !inFlight.has(actionKey(next))) actions.push(next);
  }
  return actions;
}
