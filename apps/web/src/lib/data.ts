import { API_URL, INDEXER_URL } from "./config";

/** Indexed rows arrive with bigints as decimal strings. */
export interface RoundRow {
  id: `0x${string}`;
  token: `0x${string}`;
  creator: `0x${string}`;
  launchpad: `0x${string}`;
  quote: `0x${string}`;
  mode: number;
  name: string;
  symbol: string;
  openAt: number;
  lockAt: number;
  closeAt: number;
  fireBy: number;
  minRaise: string;
  maxRaise: string;
  walletCap: string;
  creatorCap: string;
  status: "live" | "fired" | "aborted";
  abortReason: number | null;
  totalCommitted: string;
  participants: number;
  createdAt: number;
  createdTx: `0x${string}`;
  firedAt: number | null;
  firedTx: `0x${string}` | null;
  poolId: `0x${string}` | null;
  vault: `0x${string}` | null;
  quoteUsed: string | null;
  tokensOut: string | null;
  avgPriceX96: string | null;
  shortfall: string | null;
}

export interface CommitRow {
  id: string;
  round: `0x${string}`;
  wallet: `0x${string}`;
  kind: "commit" | "withdraw" | "refund" | "claim";
  identityId: `0x${string}` | null;
  amount: string;
  tokens: string | null;
  walletTotal: string | null;
  roundTotal: string | null;
  timestamp: number;
  tx: `0x${string}`;
}

async function get<T>(url: string, init?: RequestInit & { next?: { revalidate?: number } }): Promise<T | null> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const indexer = {
  rounds: (status?: string) => get<RoundRow[]>(`${INDEXER_URL}/rounds${status ? `?status=${status}` : ""}`, { next: { revalidate: 5 } }),
  round: (address: string) => get<RoundRow & { participantsList: unknown[] }>(`${INDEXER_URL}/rounds/${address}`, { cache: "no-store" }),
  commits: (address: string) => get<CommitRow[]>(`${INDEXER_URL}/rounds/${address}/commits`, { cache: "no-store" }),
  certificate: (token: string) => get<{ id: string; round: string; data: Record<string, unknown>; tx: string }>(`${INDEXER_URL}/certificates/${token}`),
  vaultFlows: (vault: string) => get<unknown[]>(`${INDEXER_URL}/vaults/${vault}/flows`, { cache: "no-store" }),
  stats: () => get<{ rounds: number; live: number; fired: number; quoteLaunched: string; participants: number }>(`${INDEXER_URL}/stats`, { next: { revalidate: 10 } }),
};

export const api = {
  analysis: () => get<{ summary: Record<string, number | null>; launches: unknown[]; generatedFromBlock: string }>(`${API_URL}/analysis`, { next: { revalidate: 300 } }),
  rules: () => get<Record<string, unknown>>(`${API_URL}/rules/v1`, { next: { revalidate: 3600 } }),
};
