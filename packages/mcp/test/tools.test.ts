import { type Address, decodeFunctionData, erc20Abi } from "viem";
import { describe, expect, it } from "vitest";
import { updraftFactoryAbi, updraftRoundAbi } from "@updraft/sdk";
import { buildTools } from "../src/tools.js";

const ROUND = "0x1111111111111111111111111111111111111111" as Address;
const USDC = "0x84Cc00D13173f7016Bbab22A736dBf75A154cFE2" as Address;
const WALLET = "0x2222222222222222222222222222222222222222" as Address;
const FACTORY = "0x3333333333333333333333333333333333333333" as Address;

const fakeState = {
  address: ROUND,
  status: 0,
  abortReason: "none",
  expectedToken: "0x4444444444444444444444444444444444444444",
  totalCommitted: 1_000_000_000n,
  participantCount: 3,
  verifiedCount: 0,
  config: { quote: USDC, name: "Test", symbol: "TST", windows: { closeAt: 100 }, raise: { maxRaise: 5n } },
  preview: { usable: 1n, effective: 1n, parity: 0n, devBuy: 1n, tokensOut: 10n, platformTokens: 0n, avgPriceX96: 7n },
};

const tools = buildTools({
  updraft: {
    isRound: async (r: Address) => r === ROUND,
    listRounds: async () => [ROUND],
    getRound: async () => fakeState as never,
    previewCommit: async (_r: Address, extra: bigint) => ({ effective: extra, tokensOut: 99n, netTokens: 98n, avgPriceX96: 5n }),
    getCertificate: async () => ({ participants: 12, top10Bps: 4100 }) as never,
  },
  factory: FACTORY,
  analysisUrl: "https://api.example/analysis",
  fetchFn: async () => new Response(JSON.stringify({ summary: { launches: 251 } })),
  now: () => 50,
});
const tool = (name: string) => {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return t;
};

describe("mcp tools", () => {
  it("exposes the documented tool set", () => {
    expect(tools.map((t) => t.name).sort()).toEqual([
      "updraft_bottom_of_curve",
      "updraft_build_commit_tx",
      "updraft_build_create_round_tx",
      "updraft_get_certificate",
      "updraft_get_round",
      "updraft_list_rounds",
      "updraft_preview_price",
    ]);
  });

  it("serialises bigints in round state", async () => {
    const out = (await tool("updraft_get_round").handler({ round: ROUND })) as Record<string, unknown>;
    expect(out.totalCommitted).toBe("1000000000");
    expect(typeof (out.preview as Record<string, unknown>).tokensOut).toBe("string");
  });

  it("previews the price for an extra commit", async () => {
    const out = (await tool("updraft_preview_price").handler({ round: ROUND, amount: "250000000" })) as Record<string, unknown>;
    expect(out.effective).toBe("250000000");
    expect(out.netTokens).toBe("98");
  });

  it("builds unsigned approve + commit transactions and never signs", async () => {
    const out = (await tool("updraft_build_commit_tx").handler({ round: ROUND, wallet: WALLET, amount: "500000000" })) as {
      transactions: { to: Address; data: `0x${string}`; from: Address }[];
    };
    expect(out.transactions).toHaveLength(2);
    const approve = decodeFunctionData({ abi: erc20Abi, data: out.transactions[0].data });
    expect(out.transactions[0].to).toBe(USDC);
    expect(approve.functionName).toBe("approve");
    expect(approve.args).toEqual([ROUND, 500_000_000n]);
    const commit = decodeFunctionData({ abi: updraftRoundAbi, data: out.transactions[1].data });
    expect(commit.functionName).toBe("commit");
    expect(out.transactions[1].from).toBe(WALLET);
  });

  it("builds an unsigned createRound transaction from JSON config", async () => {
    const config = {
      launchpad: "0x6d01f6644bbf1b5074472D3e85aa1465B4d2bF3d",
      quote: USDC,
      name: "Agent Round",
      symbol: "AGR",
      tokenSalt: `0x${"00".repeat(31)}01`,
      creator: WALLET,
      mode: 0,
      attestor: "0x0000000000000000000000000000000000000000",
      windows: { openAt: 1, lockAt: 2, closeAt: 3, fireBy: 4 },
      raise: { minRaise: "100000000", maxRaise: "50000000000", walletCap: "5000000000", creatorCap: "2000000000", minCommit: "1000000" },
      participantVesting: { tgeBps: 10000, cliff: 0, duration: 0 },
      creatorVesting: { tgeBps: 0, cliff: 86400, duration: 604800 },
      policy: { platformBps: 1000, bidBps: 3000, stakersBps: 3000, teamBps: 3000 },
      bounds: {
        min: { platformBps: 1000, bidBps: 1000, stakersBps: 0, teamBps: 0 },
        max: { platformBps: 1000, bidBps: 6000, stakersBps: 6000, teamBps: 6000 },
        timelock: 259200,
      },
      listingCap: "0",
      exitEnabled: false,
    };
    const out = (await tool("updraft_build_create_round_tx").handler({ config, roundSalt: `0x${"00".repeat(31)}09` })) as {
      transaction: { to: Address; data: `0x${string}` };
    };
    expect(out.transaction.to).toBe(FACTORY);
    const decoded = decodeFunctionData({ abi: updraftFactoryAbi, data: out.transaction.data });
    expect(decoded.functionName).toBe("createRound");
    expect((decoded.args[0] as { raise: { maxRaise: bigint } }).raise.maxRaise).toBe(50_000_000_000n);
  });

  it("refuses to build transactions for a contract that is not an Updraft round", async () => {
    const out = (await tool("updraft_build_commit_tx").handler({ round: WALLET, wallet: WALLET, amount: "1" })) as Record<string, unknown>;
    expect(out).toMatchObject({ ok: false, reason: "not_an_updraft_round" });
    const read = (await tool("updraft_get_round").handler({ round: WALLET })) as Record<string, unknown>;
    expect(read).toMatchObject({ ok: false, reason: "not_an_updraft_round" });
  });

  it("refuses to build a commit for a round that is not open", async () => {
    const closed = buildTools({
      updraft: {
        isRound: async () => true,
        listRounds: async () => [ROUND],
        getRound: async () => ({ ...fakeState, status: 1 }) as never,
        previewCommit: async () => ({}) as never,
        getCertificate: async () => ({}) as never,
      },
      factory: FACTORY,
      analysisUrl: "x",
      now: () => 50,
    }).find((t) => t.name === "updraft_build_commit_tx")!;
    expect(await closed.handler({ round: ROUND, wallet: WALLET, amount: "1" })).toMatchObject({ ok: false, reason: "round_not_open" });
  });

  it("returns the bottom-of-curve analysis", async () => {
    const out = (await tool("updraft_bottom_of_curve").handler({})) as { summary: { launches: number } };
    expect(out.summary.launches).toBe(251);
  });
});
