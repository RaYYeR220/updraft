import { AbortReasons } from "@updraft/sdk";

/**
 * Wallets whose rounds are Updraft's own rehearsals, not launches: the deployer, and the creators our
 * end-to-end test runs from. Only an address we hold marks a round as ours, never its name.
 */
const REHEARSAL_CREATORS = new Set([
  "0xc6d9588923181fbb84acf028a85c442421828f02",
  "0xe87f8fa43e2bf522365fdb0347982647f57962ac",
  "0x34e41d7818e3478db685fa34de2e28b33b612a27",
]);
export const isRehearsal = (creator: string) => REHEARSAL_CREATORS.has(creator.toLowerCase());

const Q96 = 2 ** 96;
/** Raw quote (6 dp) per raw token (18 dp) to USDC per whole token. */
const RAW_TO_USDC = 1e12;

export const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

type Raw = bigint | string | number | null | undefined;
const big = (v: Raw) => (v === null || v === undefined ? 0n : typeof v === "bigint" ? v : BigInt(v));

export const usdcNum = (v: Raw) => Number(big(v)) / 1e6;
export const tokenNum = (v: Raw) => Number(big(v)) / 1e18;

const grouped = (v: number, max: number) => v.toLocaleString("en-US", { maximumFractionDigits: max, minimumFractionDigits: 0 });

/** "12,480" or "12.5" — whole dollars once amounts are large, cents below that. */
export function usdc(v: Raw): string {
  const n = usdcNum(v);
  return grouped(n, Math.abs(n) >= 1000 ? 0 : 2);
}

/** Compact token counts: 173.59M, 4.2K, 812. */
export function tokens(v: Raw | number): string {
  const n = typeof v === "number" ? v : tokenNum(v);
  return compact(n);
}

export function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${trim(n / 1e9)}B`;
  if (a >= 1e6) return `${trim(n / 1e6)}M`;
  if (a >= 1e4) return `${trim(n / 1e3)}K`;
  return grouped(n, a >= 100 ? 0 : 2);
}
const trim = (n: number) =>
  (Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2)).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");

export const priceFromX96 = (x96: Raw) => (Number(big(x96)) / Q96) * RAW_TO_USDC;

/** Pool price as USDC per token, from a sqrtPriceX96 in the pool's own orientation. */
export function priceFromSqrt(sqrtX96: Raw, tokenIs0: boolean): number {
  const p = (Number(big(sqrtX96)) / Q96) ** 2;
  if (p === 0) return 0;
  return (tokenIs0 ? p : 1 / p) * RAW_TO_USDC;
}

/** "$0.00001158": four significant digits for sub-cent prices. */
export function price(p: number, sig = 4): string {
  if (!Number.isFinite(p) || p <= 0) return "$0";
  if (p >= 1) return `$${grouped(p, 4)}`;
  const decimals = Math.min(20, Math.max(2, sig - 1 - Math.floor(Math.log10(p))));
  return `$${p.toFixed(decimals)}`;
}

export const pct = (bps: number, digits = 1) => `${(bps / 100).toFixed(digits).replace(/\.0+$/, "")}%`;

export function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const unit = (n: number, one: string) => `${n % 1 === 0 ? n : n.toFixed(1)} ${one}${n === 1 ? "" : "s"}`;
  if (s === 0) return "0 seconds";
  if (s % 86_400 === 0 || s >= 7 * 86_400) return unit(Math.round((s / 86_400) * 10) / 10, "day");
  if (s % 3600 === 0 || s >= 86_400) return unit(Math.round((s / 3600) * 10) / 10, "hour");
  if (s % 60 === 0 || s >= 3600) return unit(Math.round((s / 60) * 10) / 10, "minute");
  return unit(s, "second");
}

/** "30-day", "10-minute": a duration used as an adjective. */
export const durationAdj = (seconds: number) => duration(seconds).replace(/ (\w+?)s?$/, "-$1");

export interface VestingLike {
  tgeBps: number;
  cliff: number;
  duration: number;
}

/** Plain-words vesting: "a 30-day cliff, then 90 days linear". */
export function vesting(v: VestingLike): string {
  if (v.tgeBps >= 10_000 || (v.cliff === 0 && v.duration === 0)) return "all unlocked at T0";
  const parts: string[] = [];
  if (v.tgeBps > 0) parts.push(`${pct(v.tgeBps)} at T0`);
  if (v.cliff > 0) parts.push(`a ${durationAdj(v.cliff)} cliff`);
  if (v.duration > 0) parts.push(`${parts.length ? "then " : ""}${duration(v.duration)} linear`);
  return parts.join(", ");
}

/** Share of a vesting schedule unlocked `elapsed` seconds after fire, 0 to 1. */
export function vestedAt(v: VestingLike, elapsed: number): number {
  const tge = v.tgeBps / 10_000;
  if (elapsed < v.cliff) return tge;
  if (v.duration === 0) return 1;
  return Math.min(1, tge + (1 - tge) * ((elapsed - v.cliff) / v.duration));
}

const dayFmt = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});
const fullFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

/** "Mon 19 Oct, 17:00 UTC" */
export const when = (ts: number) => `${dayFmt.format(new Date(ts * 1000))} UTC`;
/** "19 Oct 2026, 17:00 UTC" */
export const whenFull = (ts: number) => `${fullFmt.format(new Date(ts * 1000))} UTC`;

export function countdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d ? `${d}d ` : ""}${p(h)}:${p(m)}:${p(s % 60)}`;
}

/** "in 1d 03h", "in 41m", "in 12s" */
export function soon(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s >= 86_400) return `${Math.floor(s / 86_400)}d ${String(Math.floor((s % 86_400) / 3600)).padStart(2, "0")}h`;
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
  if (s >= 60) return `${Math.floor(s / 60)}m`;
  return `${s}s`;
}

export function ago(ts: number, now: number): string {
  const s = Math.max(0, now - ts);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86_400);
  return d < 30 ? `${d} day${d === 1 ? "" : "s"} ago` : when(ts);
}

export type Phase = "upcoming" | "open" | "locked" | "ready" | "overdue" | "fired" | "aborted";

export interface WindowsLike {
  openAt: number;
  lockAt: number;
  closeAt: number;
  fireBy: number;
}

/** Where a round is in its life, from its on-chain status (0 live, 1 fired, 2 aborted) and the clock. */
export function phaseOf(status: number | string, w: WindowsLike, now: number): Phase {
  if (status === 1 || status === "fired") return "fired";
  if (status === 2 || status === "aborted") return "aborted";
  if (now < w.openAt) return "upcoming";
  if (now < w.lockAt) return "open";
  if (now < w.closeAt) return "locked";
  if (now <= w.fireBy) return "ready";
  return "overdue";
}

export const PHASE_LABEL: Record<Phase, string> = {
  upcoming: "Opens soon",
  open: "Open for commits",
  locked: "Withdrawals locked",
  ready: "Ready to fire",
  overdue: "Past its fire-by time",
  fired: "Fired",
  aborted: "Aborted",
};

const ABORT_WORDS: Record<string, string> = {
  none: "The round was aborted.",
  expired: "Nobody fired the round before its fire-by time, so it closed without launching.",
  "below-minimum": "The round closed below its minimum raise, so it did not launch.",
  "launchpad-paused": "Ascend was paused when the round tried to fire.",
  "quote-disallowed": "Ascend stopped accepting this quote token for launches, so the round could not fire on the terms it was created with.",
  "curve-changed": "Ascend changed its launch curve after the round was created, so the price everyone committed under no longer held.",
  "launchpad-revoked": "Updraft stopped allowing this Ascend launchpad, so the round could not fire through it.",
};

export function abortWords(reason: string | number | null | undefined): string {
  const key = typeof reason === "number" ? (AbortReasons[reason] ?? "none") : (reason ?? "none");
  return ABORT_WORDS[key] ?? ABORT_WORDS.none;
}
