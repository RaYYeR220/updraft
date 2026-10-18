import { INDEXER_URL } from "@/lib/config";
import { api, indexer, type RoundRow } from "@/lib/data";

export interface LaunchBuy {
  buyer: string;
  tokens: string;
  quote: string;
  timestamp: number;
  tx: string;
  secondsAfterLaunch: number;
  class: "creator" | "creatorFunded" | "other";
}

export interface Launch {
  launchpad: string;
  token: string;
  poolId: string;
  quote: string;
  creator: string;
  payer: string;
  launchedAt: number;
  launchTx: string;
  devBuyTokens: string;
  devBuyQuote: string;
  devBuyShareBps: number;
  insiderShareBps: number;
  othersShareBps: number;
  insiderQuote: string;
  othersQuote: string;
  priceRatioOthersToInsiders: number | null;
  nextBuyerPremium: number | null;
  buys: LaunchBuy[];
}

export interface AnalysisSummary {
  launches: number;
  launchesWithDevBuy: number;
  launchesWithOutsideBuyers: number;
  medianInsiderShareBps: number;
  meanInsiderShareBps: number;
  launchesInsidersOver5Pct: number;
  launchesInsidersOver20Pct: number;
  medianPriceRatioOthersToInsiders: number | null;
  launchesWithPriceRatio: number;
  medianNextBuyerPremium: number | null;
  launchesWithDevBuyPremium: number;
}

export interface Analysis {
  generatedFromBlock: string;
  generatedAtBlockTime: string;
  windowSeconds: number;
  launchpads: string[];
  method: string[];
  summary: AnalysisSummary;
  launches: Launch[];
}

export async function loadAnalysis(): Promise<Analysis | null> {
  const a = (await api.analysis()) as unknown as Analysis | null;
  return a && Array.isArray(a.launches) && a.summary ? a : null;
}

/** The headline numbers both the landing and the analysis page quote, derived from the launches. */
export function headline(a: Analysis) {
  const worst = a.launches.reduce((m, l) => (l.insiderShareBps > m.insiderShareBps ? l : m), a.launches[0]);
  const withPremium = a.launches.filter((l) => l.nextBuyerPremium !== null);
  const top = withPremium.reduce((m, l) => ((l.nextBuyerPremium ?? 0) > (m.nextBuyerPremium ?? 0) ? l : m), withPremium[0]);
  return {
    launches: a.summary.launches,
    withDevBuy: a.summary.launchesWithDevBuy,
    over20: a.summary.launchesInsidersOver20Pct,
    over5: a.summary.launchesInsidersOver5Pct,
    worst,
    top,
    maxPremium: top?.nextBuyerPremium ?? 0,
    block: Number(a.generatedFromBlock),
  };
}

/** The live comparison: what a buyer right after T0 got per USDC, against everyone in the batch. */
export const SNIPE_ROUND = "0x15f436B0D9A917179Fc5DD390072AD46Ed7aC03b";

interface SwapRow {
  trader: string;
  amount0: string;
  amount1: string;
  fee: number;
  timestamp: number;
  tx: string;
}

export interface SniperProof {
  round: RoundRow;
  batchPerUsdc: number;
  sniperPerUsdc: number;
  sniperQuote: number;
  feePct: number;
  secondsAfter: number;
  ratio: number;
  tx: string;
}

export async function loadSniper(): Promise<SniperProof | null> {
  try {
    const [rounds, swapsRes] = await Promise.all([
      indexer.rounds(),
      fetch(`${INDEXER_URL}/rounds/${SNIPE_ROUND}/swaps`, { next: { revalidate: 300 } }),
    ]);
    const round = rounds?.find((r) => r.id.toLowerCase() === SNIPE_ROUND.toLowerCase());
    if (!round?.avgPriceX96 || !round.firedAt || !swapsRes.ok) return null;
    const swaps = (await swapsRes.json()) as SwapRow[];
    const tokenIs0 = round.token.toLowerCase() < round.quote.toLowerCase();
    const buy = swaps
      .map((s) => {
        const t = BigInt(tokenIs0 ? s.amount0 : s.amount1);
        const q = BigInt(tokenIs0 ? s.amount1 : s.amount0);
        return { s, tokens: Number(t) / 1e18, quote: Number(-q) / 1e6 };
      })
      .filter((b) => b.tokens > 0 && b.quote > 0)
      .sort((x, y) => x.s.timestamp - y.s.timestamp)[0];
    if (!buy) return null;
    const batchPerUsdc = 1 / ((Number(round.avgPriceX96) / 2 ** 96) * 1e12);
    const sniperPerUsdc = buy.tokens / buy.quote;
    return {
      round,
      batchPerUsdc,
      sniperPerUsdc,
      sniperQuote: buy.quote,
      feePct: buy.s.fee / 1e4,
      secondsAfter: buy.s.timestamp - round.firedAt,
      ratio: batchPerUsdc / sniperPerUsdc,
      tx: buy.s.tx,
    };
  } catch {
    return null;
  }
}
