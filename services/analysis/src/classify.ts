import type { Address, Hex } from "viem";

export const TOTAL_SUPPLY = 10n ** 27n;

export interface Launch {
  launchpad: Address;
  token: Address;
  poolId: Hex;
  creator: Address;
  /** Who sent the launch transaction (and paid the dev-buy). */
  payer: Address;
  quote: Address;
  devBuyTokens: bigint;
  devBuyQuote: bigint;
  timestamp: number;
  tx: Hex;
  /** Pool price right after the dev-buy (from its Swap event), and the token's side of the pool. */
  devBuySqrtPriceX96?: bigint;
  tokenIs0?: boolean;
}

export interface Buy {
  buyer: Address;
  tokens: bigint;
  quote: bigint;
  timestamp: number;
  tx: Hex;
}

export type BuyerClass = "creator" | "creatorFunded" | "other";

export interface LaunchStats {
  launchpad: Address;
  token: Address;
  poolId: Hex;
  quote: Address;
  creator: Address;
  payer: Address;
  launchedAt: number;
  launchTx: Hex;
  devBuyTokens: string;
  devBuyQuote: string;
  devBuyShareBps: number;
  insiderShareBps: number;
  othersShareBps: number;
  insiderQuote: string;
  othersQuote: string;
  /** How many times more per token everyone else paid than the insiders, in the window. Null without both sides. */
  priceRatioOthersToInsiders: number | null;
  /** The marginal price right after the dev-buy over the dev's average price: what the next buyer pays per token, relative to the dev. */
  nextBuyerPremium: number | null;
  buys: (Omit<Buy, "tokens" | "quote"> & { tokens: string; quote: string; secondsAfterLaunch: number; class: BuyerClass })[];
}

const eq = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export function classifyBuyer(buyer: Address, launch: Launch, funderOf: Map<string, string | null>): BuyerClass {
  if (eq(buyer, launch.creator) || eq(buyer, launch.payer)) return "creator";
  const funder = funderOf.get(buyer.toLowerCase()) ?? null;
  if (eq(funder, launch.creator) || eq(funder, launch.payer)) return "creatorFunded";
  return "other";
}

const bps = (part: bigint) => Number((part * 10_000n) / TOTAL_SUPPLY);

export function launchStats(launch: Launch, allBuys: Buy[], funderOf: Map<string, string | null>, windowSeconds: number): LaunchStats {
  const window = allBuys.filter((b) => b.timestamp - launch.timestamp <= windowSeconds && b.timestamp >= launch.timestamp);
  let insiderTokens = launch.devBuyTokens;
  let insiderQuote = launch.devBuyQuote;
  let othersTokens = 0n;
  let othersQuote = 0n;
  const buys = window.map((b) => {
    const cls = classifyBuyer(b.buyer, launch, funderOf);
    if (cls === "other") {
      othersTokens += b.tokens;
      othersQuote += b.quote;
    } else {
      insiderTokens += b.tokens;
      insiderQuote += b.quote;
    }
    return { ...b, tokens: b.tokens.toString(), quote: b.quote.toString(), secondsAfterLaunch: b.timestamp - launch.timestamp, class: cls };
  });

  let ratio: number | null = null;
  if (insiderTokens > 0n && insiderQuote > 0n && othersTokens > 0n && othersQuote > 0n) {
    const SCALE = 10n ** 9n;
    ratio = Number((othersQuote * insiderTokens * SCALE) / (othersTokens * insiderQuote)) / 1e9;
  }

  let premium: number | null = null;
  if (launch.devBuyTokens > 0n && launch.devBuyQuote > 0n && launch.devBuySqrtPriceX96 && launch.tokenIs0 !== undefined) {
    const p = (Number(launch.devBuySqrtPriceX96) / 2 ** 96) ** 2; // currency1 per currency0, raw units
    const marginal = launch.tokenIs0 ? p : 1 / p;
    const average = Number(launch.devBuyQuote) / Number(launch.devBuyTokens);
    premium = marginal / average;
  }

  return {
    launchpad: launch.launchpad,
    token: launch.token,
    poolId: launch.poolId,
    quote: launch.quote,
    creator: launch.creator,
    payer: launch.payer,
    launchedAt: launch.timestamp,
    launchTx: launch.tx,
    devBuyTokens: launch.devBuyTokens.toString(),
    devBuyQuote: launch.devBuyQuote.toString(),
    devBuyShareBps: bps(launch.devBuyTokens),
    insiderShareBps: bps(insiderTokens),
    othersShareBps: bps(othersTokens),
    insiderQuote: insiderQuote.toString(),
    othersQuote: othersQuote.toString(),
    priceRatioOthersToInsiders: ratio,
    nextBuyerPremium: premium,
    buys,
  };
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function aggregate(stats: LaunchStats[]) {
  const ratios = stats.map((s) => s.priceRatioOthersToInsiders).filter((r): r is number => r !== null);
  const premiums = stats.map((s) => s.nextBuyerPremium).filter((r): r is number => r !== null);
  return {
    launches: stats.length,
    launchesWithDevBuy: stats.filter((s) => s.devBuyShareBps > 0).length,
    launchesWithOutsideBuyers: stats.filter((s) => s.othersShareBps > 0).length,
    medianInsiderShareBps: median(stats.map((s) => s.insiderShareBps)),
    meanInsiderShareBps: stats.length ? Math.round(stats.reduce((a, s) => a + s.insiderShareBps, 0) / stats.length) : 0,
    launchesInsidersOver5Pct: stats.filter((s) => s.insiderShareBps > 500).length,
    launchesInsidersOver20Pct: stats.filter((s) => s.insiderShareBps > 2000).length,
    medianPriceRatioOthersToInsiders: ratios.length ? median(ratios) : null,
    launchesWithPriceRatio: ratios.length,
    medianNextBuyerPremium: premiums.length ? median(premiums) : null,
    launchesWithDevBuyPremium: premiums.length,
  };
}
