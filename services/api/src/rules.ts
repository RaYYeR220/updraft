/**
 * Eligibility rules for Verified rounds. They gate who may take part; they never scale the cap,
 * so having more money on Hyperliquid buys no extra allocation. Published at GET /rules/v1.
 */
export const RULES_V1 = {
  version: "v1",
  minAgeDays: 30,
  minFills: 5,
  minStakedHype: 1,
  minVolumeUsd: 1000,
  hubTxCount: 5000,
  description: [
    "The Hyperliquid account's first ledger activity or fill is at least 30 days old.",
    "It shows real activity: at least 5 fills, or at least 1 HYPE staked, or at least $1,000 lifetime volume.",
    "Its Elysium wallet was not first funded by a private wallet that also funded another wallet already admitted to the same round.",
    "Contracts and public hubs (5,000+ transactions, e.g. the faucet) never link wallets.",
    "One verified identity per round; every verified participant gets the same cap.",
  ],
} as const;

export interface HlFacts {
  firstActivityMs: number | null;
  fills: number;
  volumeUsd: number;
  stakedHype: number;
}

export type Verdict = { eligible: true } | { eligible: false; reason: "too_new" | "no_activity" };

export function evaluate(f: HlFacts, nowMs: number): Verdict {
  const ageDays = f.firstActivityMs === null ? 0 : (nowMs - f.firstActivityMs) / 86_400_000;
  if (ageDays < RULES_V1.minAgeDays) return { eligible: false, reason: "too_new" };
  const active =
    f.fills >= RULES_V1.minFills || f.stakedHype >= RULES_V1.minStakedHype || f.volumeUsd >= RULES_V1.minVolumeUsd;
  if (!active) return { eligible: false, reason: "no_activity" };
  return { eligible: true };
}
