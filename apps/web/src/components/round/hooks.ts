"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { type Address, type Hash, erc20Abi } from "viem";
import { type RoundState, Status, updraftLensAbi, updraftRoundAbi } from "@updraft/sdk";
import { INDEXER_URL, deployment } from "@/lib/config";
import { type CommitRow, indexer } from "@/lib/data";
import { publicClient, useWallet } from "@/lib/wallet";
import { type ErrorContext, explain } from "./errors";
import { priceFromSqrt, priceFromX96, tokenNum, usdcNum } from "./format";
import { findRound, roundNumbers } from "./registry";

export interface Participant {
  wallet: `0x${string}`;
  committed: string;
  identityId: `0x${string}` | null;
  claimedTokens: string;
  refunded: string;
}

export interface SwapRow {
  id: string;
  trader: `0x${string}`;
  amount0: string;
  amount1: string;
  sqrtPriceX96: string;
  fee: number;
  timestamp: number;
  tx: `0x${string}`;
}

export interface RoundParams {
  parityBps: number;
  platformTokenBps: number;
  platformFeeBps: number;
  minPolicyTimelock: number;
  maxTeamBps: number;
}

/** Wall-clock seconds, ticking. Null until mounted so server and client render the same markup. */
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useDebounced<T>(value: T, ms = 320): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export const tokenIs0 = (s: RoundState) => s.expectedToken.toLowerCase() < s.config.quote.toLowerCase();

const lens = { address: deployment.lens, abi: updraftLensAbi } as const;

async function priceAfter(s: RoundState, quoteIn: bigint): Promise<number> {
  const sqrt = await publicClient.readContract({
    ...lens,
    functionName: "priceAfter",
    args: [s.config.launchpad, s.config.quote, tokenIs0(s), quoteIn],
  });
  return priceFromSqrt(sqrt, tokenIs0(s));
}

export function useRoundState(address: Address) {
  const { updraft } = useWallet();
  // the factory that created it: null when no Updraft factory did
  const known = useQuery({
    queryKey: ["round-factory", address],
    queryFn: () => findRound(publicClient, address),
    staleTime: Number.POSITIVE_INFINITY,
    refetchInterval: false,
  });
  const state = useQuery({
    queryKey: ["round", address],
    queryFn: () => updraft.getRound(address),
    enabled: !!known.data,
    refetchInterval: 5_000,
  });
  const params = useQuery({
    queryKey: ["round-params", address],
    queryFn: async () =>
      (await publicClient.readContract({ address, abi: updraftRoundAbi, functionName: "params" })) as unknown as RoundParams,
    enabled: !!known.data,
    staleTime: Number.POSITIVE_INFINITY,
    refetchInterval: false,
  });
  const number = useQuery({
    queryKey: ["round-number", address],
    queryFn: async () => (await roundNumbers(publicClient)).get(address.toLowerCase()) ?? null,
    enabled: !!known.data,
    staleTime: Number.POSITIVE_INFINITY,
    refetchInterval: false,
  });
  return { known, state, params, number };
}

export function useIndexed(address: Address, fired: boolean) {
  const round = useQuery({
    queryKey: ["idx-round", address],
    queryFn: () => indexer.round(address),
    refetchInterval: 5_000,
  });
  const commits = useQuery({
    queryKey: ["idx-commits", address],
    queryFn: async () => (await indexer.commits(address)) ?? ([] as CommitRow[]),
    refetchInterval: 5_000,
  });
  const swaps = useQuery({
    queryKey: ["idx-swaps", address],
    queryFn: async () => {
      try {
        const res = await fetch(`${INDEXER_URL}/rounds/${address}/swaps`, { cache: "no-store" });
        return res.ok ? ((await res.json()) as SwapRow[]) : [];
      } catch {
        return [] as SwapRow[];
      }
    },
    enabled: fired,
    refetchInterval: 15_000,
  });
  const participants = ((round.data?.participantsList ?? []) as Participant[]).filter((p) => BigInt(p.committed) > 0n);
  return { round, commits, swaps, participants };
}

/**
 * The committers, from the indexer; read straight from the round when the indexer is behind the chain
 * (a fresh commit not indexed yet, or the indexer down) and the round is small enough to list in one call.
 */
export function useParticipants(state: RoundState | undefined, indexed: Participant[], indexedReady: boolean) {
  const n = state?.participantCount ?? 0;
  const behind = !!state && indexedReady && indexed.length !== n && n > 0 && n <= 250;
  const chain = useQuery({
    queryKey: ["participants", state?.address, n, state?.totalCommitted.toString()],
    enabled: behind,
    placeholderData: keepPreviousData,
    refetchInterval: false,
    queryFn: async (): Promise<Participant[]> => {
      const r = { address: state!.address, abi: updraftRoundAbi } as const;
      const wallets = (await publicClient.multicall({
        allowFailure: false,
        batchSize: 0,
        contracts: Array.from({ length: n }, (_, i) => ({ ...r, functionName: "participantAt", args: [BigInt(i)] }) as const),
      })) as `0x${string}`[];
      const facts = await publicClient.multicall({
        allowFailure: false,
        batchSize: 0,
        contracts: wallets.flatMap((w) => [
          { ...r, functionName: "commitOf", args: [w] } as const,
          { ...r, functionName: "identityOf", args: [w] } as const,
        ]),
      });
      return wallets
        .map((w, i) => ({
          wallet: w,
          committed: String(facts[2 * i]),
          identityId: facts[2 * i + 1] as `0x${string}`,
          claimedTokens: "0",
          refunded: "0",
        }))
        .filter((p) => BigInt(p.committed) > 0n);
    },
  });
  return behind && chain.data ? chain.data : indexed;
}

export interface Position {
  balance: bigint;
  committed: bigint;
  identity: `0x${string}`;
  claimableTokens: bigint;
  claimableRefund: bigint;
  claimedTokens: bigint;
  refundPaid: bigint;
  refunded: boolean;
}

export function usePosition(state: RoundState | undefined, wallet: Address | null) {
  return useQuery({
    queryKey: ["position", state?.address, wallet],
    enabled: !!state && !!wallet,
    refetchInterval: 5_000,
    queryFn: async (): Promise<Position> => {
      const s = state!;
      const w = wallet!;
      const r = { address: s.address, abi: updraftRoundAbi } as const;
      const [balance, committed, identity, claimable, claimedTokens, refundPaid, refunded] = await publicClient.multicall({
        allowFailure: false,
        contracts: [
          { address: s.config.quote, abi: erc20Abi, functionName: "balanceOf", args: [w] },
          { ...r, functionName: "commitOf", args: [w] },
          { ...r, functionName: "identityOf", args: [w] },
          { ...r, functionName: "claimable", args: [w] },
          { ...r, functionName: "claimedTokens", args: [w] },
          { ...r, functionName: "refundPaid", args: [w] },
          { ...r, functionName: "refunded", args: [w] },
        ],
      });
      return {
        balance,
        committed,
        identity,
        claimableTokens: claimable[0],
        claimableRefund: claimable[1],
        claimedTokens,
        refundPaid,
        refunded,
      };
    },
  });
}

/** The batch as it stands (or with `extra` USDC added, negative for a withdrawal), in display units. */
export interface Batch {
  effective: number;
  devBuy: number;
  tokensOut: number;
  netTokens: number;
  avg: number;
  /** Curve price right after the batch: where the next buyer starts, before Ascend's launch fee. */
  next: number;
  /** Committed beyond the max raise, refunded pro-rata. */
  oversubscribed: number;
  total: number;
}

export function useBatch(state: RoundState | undefined, params: RoundParams | undefined, extra: bigint) {
  const { updraft } = useWallet();
  return useQuery({
    queryKey: ["batch", state?.address, state?.status, state?.totalCommitted.toString(), extra.toString()],
    enabled: !!state && !!params,
    placeholderData: keepPreviousData,
    staleTime: 4_000,
    refetchInterval: false,
    queryFn: async (): Promise<Batch> => {
      const s = state!;
      const p = params!;
      if (s.status === Status.Fired && s.fired) {
        const f = s.fired;
        const parity = (f.quoteUsed * BigInt(p.parityBps)) / 10_000n;
        const devBuy = f.quoteUsed - parity;
        const next = await priceAfter(s, devBuy);
        const total = usdcNum(s.totalCommitted);
        return {
          effective: usdcNum(f.quoteUsed),
          devBuy: usdcNum(devBuy),
          tokensOut: tokenNum(f.tokensOut),
          netTokens: tokenNum(f.netTokens),
          avg: f.netTokens > 0n ? usdcNum(f.quoteUsed) / tokenNum(f.netTokens) : 0,
          next,
          oversubscribed: usdcNum(f.refundPool),
          total,
        };
      }
      let effective: bigint;
      let tokensOut: bigint;
      let net: bigint;
      let avgX96: bigint;
      let usable = s.preview.usable;
      if (extra === 0n) {
        effective = s.preview.effective;
        tokensOut = s.preview.tokensOut;
        net = tokensOut - s.preview.platformTokens;
        avgX96 = s.preview.avgPriceX96;
      } else {
        const add = extra < -s.preview.usable ? -s.preview.usable : extra;
        const r = await updraft.previewCommit(s.address, add);
        usable = s.preview.usable + add;
        effective = r.effective;
        tokensOut = r.tokensOut;
        net = r.netTokens;
        avgX96 = r.avgPriceX96;
      }
      const parity = (effective * BigInt(p.parityBps)) / 10_000n;
      const devBuy = effective - parity;
      const next = await priceAfter(s, devBuy);
      return {
        effective: usdcNum(effective),
        devBuy: usdcNum(devBuy),
        tokensOut: tokenNum(tokensOut),
        netTokens: tokenNum(net),
        avg: priceFromX96(avgX96),
        next,
        oversubscribed: Math.max(0, usdcNum(usable - effective)),
        total: usdcNum(usable),
      };
    },
  });
}

export interface CurvePoint {
  /** USDC spent on the launch buy to get here. */
  q: number;
  /** Tokens sold. */
  tokens: number;
  /** Curve price after spending q, USDC per token. */
  price: number;
}

const NICE = [1, 2, 2.5, 5];
/** The smallest 1/2/2.5/5 × 10^k USDC at or above `usd`. */
export function niceSpan(usd: number): number {
  const k = Math.floor(Math.log10(Math.max(usd, 1)));
  for (const n of NICE) if (n * 10 ** k >= usd) return n * 10 ** k;
  return 10 ** (k + 1);
}

/** Samples Ascend's real launch curve for this round's launchpad and quote through the deployed lens. */
export function useCurve(state: RoundState | undefined, spanUsd: number | null, samples = 48) {
  return useQuery({
    queryKey: ["curve", state?.config.launchpad, state?.config.quote, state ? tokenIs0(state) : null, spanUsd],
    enabled: !!state && !!spanUsd,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchInterval: false,
    queryFn: async (): Promise<CurvePoint[]> => {
      const s = state!;
      const span = BigInt(Math.round(spanUsd! * 1e6));
      const t0 = tokenIs0(s);
      const qs = Array.from({ length: samples + 1 }, (_, i) => (span * BigInt(i)) / BigInt(samples));
      // one eth_call for the whole curve, so sampling never trips the RPC's rate limit
      const res = await publicClient.multicall({
        allowFailure: true,
        batchSize: 0,
        contracts: qs.flatMap((q) => [
          { ...lens, functionName: "preview", args: [s.config.launchpad, s.config.quote, t0, q] } as const,
          { ...lens, functionName: "priceAfter", args: [s.config.launchpad, s.config.quote, t0, q] } as const,
        ]),
      });
      const out: CurvePoint[] = [];
      qs.forEach((q, i) => {
        const pv = res[2 * i];
        const pa = res[2 * i + 1];
        if (pv.status !== "success" || pa.status !== "success") return;
        const [tokensOut] = pv.result as readonly [bigint, bigint];
        out.push({ q: usdcNum(q), tokens: tokenNum(tokensOut), price: priceFromSqrt(pa.result as bigint, t0) });
      });
      return out;
    },
  });
}

export interface TxState {
  label: string;
  phase: "signing" | "pending" | "done" | "failed";
  hash?: Hash;
  message?: string;
}

/** Sends a write, waits for its receipt, refreshes every query and reports in plain words. */
export function useTx() {
  const qc = useQueryClient();
  const [tx, setTx] = useState<TxState | null>(null);
  const run = useCallback(
    async (label: string, send: () => Promise<Hash>, opts: { ctx?: ErrorContext; done: string | (() => Promise<string>) }) => {
      setTx({ label, phase: "signing" });
      try {
        const hash = await send();
        setTx({ label, phase: "pending", hash });
        const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
        if (receipt.status !== "success") {
          setTx({ label, phase: "failed", hash, message: "The transaction reverted on chain. Nothing changed." });
          return false;
        }
        const message = typeof opts.done === "string" ? opts.done : await opts.done().catch(() => "Confirmed.");
        setTx({ label, phase: "done", hash, message });
        await qc.invalidateQueries();
        return true;
      } catch (e) {
        setTx((t) => ({ label, phase: "failed", hash: t?.hash, message: explain(e, opts.ctx) }));
        return false;
      }
    },
    [qc],
  );
  return { tx, run, clear: () => setTx(null) };
}
