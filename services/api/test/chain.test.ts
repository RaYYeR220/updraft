import { type Address, createPublicClient, custom, decodeFunctionData, encodeFunctionResult } from "viem";
import { describe, expect, it } from "vitest";
import { updraftRoundAbi } from "@updraft/sdk";
import { viemChainReader } from "../src/chain.js";

const ROUND = "0x1111111111111111111111111111111111111111" as Address;
const ATTESTOR = "0xEb596FD067a24a23df95D634EB926aA058237789" as Address;
const zero = "0x0000000000000000000000000000000000000000" as Address;
const p = { platformBps: 1000, bidBps: 3000, stakersBps: 3000, teamBps: 3000 };

// A Verified round exactly as the deployed contract returns it, listing set-aside included.
const config = {
  launchpad: zero,
  quote: zero,
  name: "Verified",
  symbol: "VRF",
  tokenSalt: `0x${"00".repeat(32)}` as `0x${string}`,
  creator: zero,
  mode: 1,
  attestor: ATTESTOR,
  windows: { openAt: 1, lockAt: 2, closeAt: 1_800_000_000, fireBy: 1_800_003_600 },
  raise: { minRaise: 100n, maxRaise: 1000n, walletCap: 500n, creatorCap: 0n, minCommit: 1n },
  participantVesting: { tgeBps: 10_000, cliff: 0, duration: 0 },
  creatorVesting: { tgeBps: 0, cliff: 86_400, duration: 604_800 },
  policy: p,
  bounds: { min: p, max: p, timelock: 300 },
  listingCap: 500_000_000n,
  exitEnabled: false,
};

const client = createPublicClient({
  transport: custom({
    async request({ method, params }) {
      if (method === "eth_chainId") return "0x185d9";
      if (method !== "eth_call") throw new Error(`unexpected ${method}`);
      const { data } = (params as [{ data: `0x${string}` }])[0];
      const { functionName } = decodeFunctionData({ abi: updraftRoundAbi, data });
      if (functionName !== "config") throw new Error(`unexpected ${functionName}`);
      return encodeFunctionResult({ abi: updraftRoundAbi, functionName: "config", result: config as never });
    },
  }),
});

describe("chain reader", () => {
  it("reads a deployed round's config, listing set-aside included", async () => {
    const info = await viemChainReader(client as never, zero).roundInfo(ROUND);
    expect(info).toEqual({ mode: 1, attestor: ATTESTOR, closeAt: 1_800_000_000 });
  });
});
