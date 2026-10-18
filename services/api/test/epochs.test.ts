import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { type Address, encodeAbiParameters, keccak256 } from "viem";
import { describe, expect, it } from "vitest";
import { type StakeEvent, buildEpoch, timeWeights } from "../src/epochs.js";

const A = "0x00000000000000000000000000000000000000a1" as Address;
const B = "0x00000000000000000000000000000000000000b1" as Address;
const LCH = "0x00000000000000000000000000000000000000c1" as Address;
const USDC = "0x00000000000000000000000000000000000000d1" as Address;

describe("epoch builder", () => {
  it("weights stake by time held inside the window", () => {
    // window [1000, 2000): A holds 100 throughout; B stakes 100 at 1500.
    const events: StakeEvent[] = [
      { user: A, balance: 100n, time: 900 },
      { user: B, balance: 100n, time: 1500 },
    ];
    const w = timeWeights(events, 1000, 2000);
    expect(w.get(A.toLowerCase())).toBe(100n * 1000n);
    expect(w.get(B.toLowerCase())).toBe(100n * 500n);
  });

  it("a zero-second stake earns nothing", () => {
    const events: StakeEvent[] = [
      { user: A, balance: 100n, time: 900 },
      { user: B, balance: 1_000_000n, time: 1999 },
      { user: B, balance: 0n, time: 1999 },
    ];
    const w = timeWeights(events, 1000, 2000);
    expect(w.get(B.toLowerCase()) ?? 0n).toBe(0n);
  });

  it("allocates each asset pro rata and never more than available", () => {
    const events: StakeEvent[] = [
      { user: A, balance: 300n, time: 0 },
      { user: B, balance: 100n, time: 0 },
    ];
    const epoch = buildEpoch(events, 1000, 2000, [
      { asset: LCH, amount: 1000n },
      { asset: USDC, amount: 7n },
    ]);
    const lch = epoch.claims.filter((c) => c.asset === LCH);
    expect(lch.find((c) => c.account === A.toLowerCase())?.amount).toBe(750n);
    expect(lch.find((c) => c.account === B.toLowerCase())?.amount).toBe(250n);
    const usdcTotal = epoch.claims.filter((c) => c.asset === USDC).reduce((s, c) => s + c.amount, 0n);
    expect(usdcTotal <= 7n).toBe(true);
    expect(epoch.totals.find((t) => t.asset === USDC)?.amount).toBe(usdcTotal);
  });

  it("produces leaves and proofs the staking contract accepts", () => {
    const events: StakeEvent[] = [
      { user: A, balance: 1n, time: 0 },
      { user: B, balance: 3n, time: 0 },
    ];
    const epoch = buildEpoch(events, 0, 10, [{ asset: LCH, amount: 400n }]);
    const tree = StandardMerkleTree.load(epoch.tree);
    expect(tree.root).toBe(epoch.root);
    for (const c of epoch.claims) {
      // UpdraftStaking: keccak256(bytes.concat(keccak256(abi.encode(account, asset, amount))))
      const inner = keccak256(
        encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], [c.account as Address, c.asset, c.amount]),
      );
      const leaf = keccak256(inner);
      expect(StandardMerkleTree.verify(epoch.root, ["address", "address", "uint256"], [c.account, c.asset, c.amount], c.proof)).toBe(true);
      expect(tree.leafHash([c.account, c.asset, c.amount])).toBe(leaf);
    }
  });

  it("skips assets when nobody was staked", () => {
    const epoch = buildEpoch([], 0, 10, [{ asset: LCH, amount: 400n }]);
    expect(epoch.claims).toHaveLength(0);
    expect(epoch.totals).toHaveLength(0);
  });
});

import { runEpoch } from "../src/epoch-job.js";
import { MemoryStore } from "../src/store.js";

describe("epoch job", () => {
  it("posts the root of the time-weighted split and stores the claims", async () => {
    const posted: unknown[] = [];
    const store = new MemoryStore();
    const res = await runEpoch({
      store,
      publicApi: "https://api.example",
      chain: {
        stakeEvents: async () => [{ user: A, balance: 10n, time: 0 }],
        depositedAssets: async () => [LCH, USDC],
        available: async (a) => (a === LCH ? 500n : 0n),
        nextStart: async () => 1000,
        epochCount: async () => 3,
        latestTimestamp: async () => 1000 + 7200,
        post: async (...args) => {
          posted.push(args);
          return `0x${"ab".repeat(32)}`;
        },
      },
    });
    expect(res?.id).toBe(3);
    expect(posted).toHaveLength(1);
    const [, end, assets, amounts, uri] = posted[0] as [string, number, string[], bigint[], string];
    expect(end).toBe(1000 + 7200 - 30);
    expect(assets).toEqual([LCH]);
    expect(amounts).toEqual([500n]);
    expect(uri).toBe("https://api.example/epochs/3");
    const stored = await store.getEpoch(3);
    expect(JSON.parse(stored!.claims)[0]).toMatchObject({ account: A.toLowerCase(), amount: "500" });
  });

  it("waits until the window is long enough", async () => {
    const res = await runEpoch({
      store: new MemoryStore(),
      publicApi: "x",
      chain: {
        stakeEvents: async () => [],
        depositedAssets: async () => [],
        available: async () => 0n,
        nextStart: async () => 1000,
        epochCount: async () => 0,
        latestTimestamp: async () => 1100,
        post: async () => {
          throw new Error("should not post");
        },
      },
    });
    expect(res).toBeNull();
  });
});
