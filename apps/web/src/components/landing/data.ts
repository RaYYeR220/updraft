import { INDEXER_URL } from "@/lib/config";
import { type CommitRow, type RoundRow, indexer } from "@/lib/data";
import { headline, loadAnalysis } from "@/components/analysis/data";
import { isRehearsal as isRehearsalCreator } from "@/components/round/format";

/** The first rehearsal round's token: its certificate is the plate on the landing. */
export const REH1_TOKEN = "0xc8f59d265A064bcB20a2F8bf3027AEA502B9e0cA";

/** Rounds we open ourselves to rehearse launches on testnet. */
export const isRehearsal = (r: Pick<RoundRow, "creator">) => isRehearsalCreator(r.creator);

export interface ProblemFigures {
  launches: number;
  withDevBuy: number;
  over20: number;
  worstBps: number;
  maxPremium: number;
  block: number;
  /** Per launch in launch order; null when the analysis could not be fetched. */
  devBuy: boolean[] | null;
  insiderOver20: boolean[] | null;
}

/** The pinned run's figures, used only if the analysis endpoint is unreachable. */
const PINNED: ProblemFigures = {
  launches: 251,
  withDevBuy: 49,
  over20: 33,
  worstBps: 9834,
  maxPremium: 12.77,
  block: 11_040_000,
  devBuy: null,
  insiderOver20: null,
};

export async function problemFigures(): Promise<ProblemFigures> {
  const a = await loadAnalysis();
  if (!a || a.launches.length === 0) return PINNED;
  const h = headline(a);
  const ordered = [...a.launches].sort((x, y) => x.launchedAt - y.launchedAt);
  return {
    launches: h.launches,
    withDevBuy: h.withDevBuy,
    over20: h.over20,
    worstBps: h.worst.insiderShareBps,
    maxPremium: h.maxPremium,
    block: h.block,
    devBuy: ordered.map((l) => l.devBuyShareBps > 0),
    insiderOver20: ordered.map((l) => l.insiderShareBps > 2000),
  };
}

export interface CertificateData {
  round: string;
  token: string;
  firedAt: number;
  quoteUsed: string;
  tokensOut: string;
  platformTokens: string;
  avgPriceX96: string;
  participants: number;
  verifiedIdentities: number;
  top1Bps: number;
  top10Bps: number;
  creatorTokens: string;
  creatorVesting: { tgeBps: number; cliff: number; duration: number };
  policyHash: string;
  shortfall: string;
}

export interface Plate {
  data: CertificateData;
  tx: string;
  name: string;
  symbol: string;
  mode: number;
  plateNo: number;
  rehearsal: boolean;
}

export async function certificatePlate(rounds: RoundRow[] | null): Promise<Plate | null> {
  const cert = await indexer.certificate(REH1_TOKEN);
  if (!cert?.data) return null;
  const data = cert.data as unknown as CertificateData;
  const fired = (rounds ?? []).filter((r) => r.firedAt).sort((x, y) => (x.firedAt ?? 0) - (y.firedAt ?? 0));
  const idx = fired.findIndex((r) => r.token.toLowerCase() === REH1_TOKEN.toLowerCase());
  const row = idx >= 0 ? fired[idx] : null;
  return {
    data,
    tx: cert.tx,
    name: row?.name ?? "Updraft Rehearsal One",
    symbol: row?.symbol ?? "REH1",
    mode: row?.mode ?? 0,
    plateNo: idx >= 0 ? idx + 1 : 1,
    rehearsal: row ? isRehearsal(row) : true,
  };
}

/** Live rounds first, then the most recently fired or aborted. */
export function pickRounds(rounds: RoundRow[] | null, n = 3) {
  if (!rounds) return [];
  const live = rounds.filter((r) => r.status === "live").sort((x, y) => x.closeAt - y.closeAt);
  const done = rounds.filter((r) => r.status !== "live").sort((x, y) => (y.firedAt ?? y.closeAt) - (x.firedAt ?? x.closeAt));
  return [...live, ...done].slice(0, n);
}

export interface LogEntry {
  id: string;
  at: number;
  wallet: string;
  kind: CommitRow["kind"];
  amount: string;
  symbol: string;
}

/** Commits, withdrawals and refunds across the shown rounds, newest first. */
export async function fieldLog(rounds: RoundRow[], n = 12): Promise<LogEntry[]> {
  const lists = await Promise.all(
    rounds.map(async (r) => {
      try {
        const res = await fetch(`${INDEXER_URL}/rounds/${r.id}/commits`, { next: { revalidate: 15 } });
        if (!res.ok) return [];
        const rows = (await res.json()) as CommitRow[];
        return rows
          .filter((c) => c.kind !== "claim" && BigInt(c.amount) > BigInt(0))
          .map((c) => ({ id: c.id, at: c.timestamp, wallet: c.wallet, kind: c.kind, amount: c.amount, symbol: r.symbol }));
      } catch {
        return [];
      }
    }),
  );
  return lists
    .flat()
    .sort((x, y) => y.at - x.at)
    .slice(0, n);
}
