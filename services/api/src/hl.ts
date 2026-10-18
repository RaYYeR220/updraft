import type { Address } from "viem";
import type { HlFacts } from "./rules.js";

export type InfoFn = (body: Record<string, unknown>) => Promise<unknown>;

export class HlUnavailable extends Error {}

/** POSTs to the Hyperliquid info endpoint with a timeout; any failure is HlUnavailable. */
export function hlInfo(baseUrl = "https://api.hyperliquid.xyz", timeoutMs = 8000): InfoFn {
  return async (body) => {
    const res = await fetch(`${baseUrl}/info`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new HlUnavailable(`hyperliquid ${res.status}`);
    return res.json();
  };
}

type Fill = { time: number; px: string; sz: string };
type Ledger = { time: number };
type Portfolio = [string, { vlm?: string }][];
type Delegator = { delegated?: string };

/** Reads the facts the rules look at, plus the raw responses (they go into the evidence). */
export async function fetchHlFacts(info: InfoFn, user: Address): Promise<{ facts: HlFacts; raw: Record<string, unknown> }> {
  let fills: Fill[];
  let ledger: Ledger[];
  let portfolio: Portfolio;
  let delegator: Delegator;
  try {
    [fills, ledger, portfolio, delegator] = (await Promise.all([
      info({ type: "userFills", user }),
      info({ type: "userNonFundingLedgerUpdates", user, startTime: 0 }),
      info({ type: "portfolio", user }),
      info({ type: "delegatorSummary", user }),
    ])) as [Fill[], Ledger[], Portfolio, Delegator];
  } catch (e) {
    throw new HlUnavailable(e instanceof Error ? e.message : "hyperliquid unavailable");
  }

  const times = [...(fills ?? []).map((f) => f.time), ...(ledger ?? []).map((l) => l.time)].filter(Number.isFinite);
  const allTime = (portfolio ?? []).find(([k]) => k === "allTime")?.[1];
  const facts: HlFacts = {
    firstActivityMs: times.length ? Math.min(...times) : null,
    fills: (fills ?? []).length,
    volumeUsd: Number(allTime?.vlm ?? 0),
    stakedHype: Number(delegator?.delegated ?? 0),
  };
  return { facts, raw: { fillsCount: facts.fills, firstActivityMs: facts.firstActivityMs, allTimeVolume: allTime?.vlm ?? "0", delegated: delegator?.delegated ?? "0" } };
}
