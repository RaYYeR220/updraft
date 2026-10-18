import type { Address, Hex } from "viem";
import { describe, expect, it } from "vitest";
import { type Buy, type Launch, aggregate, classifyBuyer, launchStats } from "../src/classify.js";

const C = "0x00000000000000000000000000000000000000c1" as Address; // creator
const P = "0x00000000000000000000000000000000000000c2" as Address; // payer (a bot launching for C)
const X = "0x00000000000000000000000000000000000000a1" as Address; // funded by the creator
const Y = "0x00000000000000000000000000000000000000b1" as Address; // unrelated
const Z = "0x00000000000000000000000000000000000000b2" as Address; // unrelated, late
const T = 1_790_000_000;
const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;
const M = 10n ** 24n; // 0.1% of the 1B supply

const launch: Launch = {
  launchpad: "0x00000000000000000000000000000000000000d1",
  token: "0x00000000000000000000000000000000000000e1",
  poolId: tx(99),
  creator: C,
  payer: P,
  quote: "0x00000000000000000000000000000000000000f1",
  devBuyTokens: 100n * M, // 10% of supply
  devBuyQuote: 50_000_000n, // 50 USDC
  timestamp: T,
  tx: tx(1),
};

const buys: Buy[] = [
  { buyer: X, tokens: 50n * M, quote: 100_000_000n, timestamp: T + 2, tx: tx(2) },
  { buyer: Y, tokens: 20n * M, quote: 120_000_000n, timestamp: T + 4, tx: tx(3) },
  { buyer: Z, tokens: 5n * M, quote: 60_000_000n, timestamp: T + 70, tx: tx(4) },
];

const funders = new Map<string, string | null>([
  [X.toLowerCase(), C.toLowerCase()],
  [Y.toLowerCase(), "0x00000000000000000000000000000000000000ff"],
  [Z.toLowerCase(), null],
]);

describe("classify", () => {
  it("separates the creator, wallets the creator funded, and everyone else", () => {
    expect(classifyBuyer(C, launch, funders)).toBe("creator");
    expect(classifyBuyer(P, launch, funders)).toBe("creator");
    expect(classifyBuyer(X, launch, funders)).toBe("creatorFunded");
    expect(classifyBuyer(Y, launch, funders)).toBe("other");
  });

  it("measures who took the bottom of the curve in the first 60 seconds", () => {
    const s = launchStats(launch, buys, funders, 60);
    expect(s.devBuyShareBps).toBe(1000);
    expect(s.insiderShareBps).toBe(1500); // dev-buy 10% + creator-funded 5%
    expect(s.othersShareBps).toBe(200); // Y only; Z bought after the window
    expect(s.buys).toHaveLength(2);
    // Insiders paid 150 USDC for 150M tokens; others 120 USDC for 20M tokens: 6x the insiders' price.
    expect(s.priceRatioOthersToInsiders).toBeCloseTo(6, 6);
  });

  it("prices the next buyer against the dev-buy's average price", () => {
    // token is currency0; after the dev-buy the pool price is 4 quote-units per token-unit (sqrt = 2 * 2^96),
    // while the dev paid 50e6 / 100e24 = 5e-19 on average: the next buyer pays 8e18 times more per unit.
    const s = launchStats({ ...launch, devBuySqrtPriceX96: 2n * 2n ** 96n, tokenIs0: true }, [], funders, 60);
    expect(s.nextBuyerPremium).toBeCloseTo(4 / (50e6 / 100e24), -10);
    const mirrored = launchStats({ ...launch, devBuySqrtPriceX96: 2n * 2n ** 96n, tokenIs0: false }, [], funders, 60);
    expect(mirrored.nextBuyerPremium).toBeCloseTo(0.25 / (50e6 / 100e24), -10);
    expect(launchStats(launch, [], funders, 60).nextBuyerPremium).toBeNull();
  });

  it("aggregates across launches", () => {
    const a = launchStats(launch, buys, funders, 60);
    const b = launchStats({ ...launch, devBuyTokens: 0n, devBuyQuote: 0n, tx: tx(9) }, [], funders, 60);
    const summary = aggregate([a, b]);
    expect(summary.launches).toBe(2);
    expect(summary.launchesWithDevBuy).toBe(1);
    expect(summary.medianInsiderShareBps).toBe(750);
    expect(summary.launchesInsidersOver5Pct).toBe(1);
    expect(summary.medianNextBuyerPremium).toBeNull();
  });
});
