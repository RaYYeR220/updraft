import type { Address } from "viem";
import { describe, expect, it } from "vitest";
import { type RoundView, plan } from "../src/plan.js";

const R = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Address;
const base: RoundView = {
  address: R(1),
  status: 0,
  totalCommitted: 500n,
  closeAt: 1000,
  fireBy: 2000,
  participantCount: 0,
  distributeCursor: 0,
  vault: null,
  lastHarvestAt: 0,
};

describe("keeper plan", () => {
  it("fires a round once commits close", () => {
    expect(plan([{ ...base }], 999, new Set())).toEqual([]);
    expect(plan([{ ...base }], 1000, new Set())).toEqual([{ kind: "fire", round: R(1) }]);
  });

  it("aborts a round that missed its fire deadline", () => {
    expect(plan([{ ...base }], 2001, new Set())).toEqual([{ kind: "abort", round: R(1) }]);
  });

  it("distributes a fired round in chunks from its cursor", () => {
    const fired = { ...base, status: 1 as const, participantCount: 250, distributeCursor: 100, vault: R(9), lastHarvestAt: 5000 };
    expect(plan([fired], 5001, new Set(), { chunk: 100, harvestEverySec: 1800 })).toEqual([
      { kind: "distribute", round: R(1), from: 100n, to: 200n },
    ]);
    expect(plan([{ ...fired, distributeCursor: 250 }], 5001, new Set())).toEqual([]);
  });

  it("harvests each vault at most every half hour", () => {
    const fired = { ...base, status: 1 as const, participantCount: 3, distributeCursor: 3, vault: R(9), lastHarvestAt: 1000 };
    expect(plan([fired], 2799, new Set())).toEqual([]);
    expect(plan([fired], 2800, new Set())).toEqual([{ kind: "harvest", round: R(1), vault: R(9) }]);
  });

  it("never plans an action that is already in flight", () => {
    expect(plan([{ ...base }], 1000, new Set([`fire:${R(1)}`]))).toEqual([]);
  });

  it("ignores rounds nobody committed to (no gas spent on empty or spam rounds)", () => {
    expect(plan([{ ...base, totalCommitted: 0n }], 1000, new Set())).toEqual([]);
    expect(plan([{ ...base, totalCommitted: 0n }], 2001, new Set())).toEqual([]);
  });

  it("caps the actions it takes per pass", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ ...base, address: R(i + 1) }));
    expect(plan(many, 1000, new Set(), { chunk: 100, harvestEverySec: 1800, maxActions: 10 })).toHaveLength(10);
  });

  it("leaves aborted rounds alone", () => {
    expect(plan([{ ...base, status: 2 }], 9999, new Set())).toEqual([]);
  });
});
