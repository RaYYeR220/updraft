import { formatUnits, parseUnits } from "viem";

export const short = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

/** A raw token amount for reading: grouped, trimmed, and compact from a million up. */
export function fmtAmount(raw: bigint, decimals: number, max?: number): string {
  const n = Number(formatUnits(raw, decimals));
  if (n === 0) return "0";
  if (Math.abs(n) >= 1e6) return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
  const digits = max ?? (Math.abs(n) >= 1 ? 2 : 6);
  if (Math.abs(n) < 10 ** -digits) return `<${(10 ** -digits).toFixed(digits)}`;
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

/** Parses what someone typed into raw units; null when it isn't a plain decimal. */
export function toUnits(input: string, decimals: number): bigint | null {
  const s = input.replace(/[,\s_]/g, "");
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const [, frac = ""] = s.split(".");
  if (frac.length > decimals) return null;
  try {
    return parseUnits(s, decimals);
  } catch {
    return null;
  }
}

export const pct = (bps: number) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

export type Unit = "m" | "h" | "d";
export interface Dur {
  v: string;
  unit: Unit;
}
export const UNIT_SECONDS: Record<Unit, number> = { m: 60, h: 3600, d: 86400 };
export const UNIT_LABEL: Record<Unit, string> = { m: "minutes", h: "hours", d: "days" };

/** Seconds in a typed duration, or null if the number isn't a whole, non-negative value. */
export function durSeconds(d: Dur): number | null {
  const s = d.v.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(Number(s) * UNIT_SECONDS[d.unit]);
}

export function fmtDuration(seconds: number): string {
  if (seconds <= 0) return "no time";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d} d`);
  if (h) parts.push(`${h} h`);
  if (m && d === 0) parts.push(`${m} min`);
  if (s && d === 0 && h === 0) parts.push(`${s} s`);
  return parts.slice(0, 2).join(" ") || "under a minute";
}

export function fmtCountdown(seconds: number): string {
  if (seconds <= 0) return "now";
  const d = Math.floor(seconds / 86400);
  const hms = [Math.floor((seconds % 86400) / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
  return d ? `${d}d ${hms}` : hms;
}

const UTC = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

/** "Sat 19 Oct, 17:00 UTC" */
export function fmtTime(ts: number): string {
  const parts = UTC.formatToParts(new Date(ts * 1000));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}, ${get("hour")}:${get("minute")} UTC`;
}

/** The value a datetime-local input expects, in the viewer's own time zone. */
export function toLocalInput(ts: number): string {
  const d = new Date(ts * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fromLocalInput(v: string): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}
