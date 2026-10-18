// Display formatting for amounts, prices, shares and times read from the indexer and the analysis.

const Q96 = 2 ** 96;

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export const int = (n: number) => Math.round(n).toLocaleString("en-US");

/** Base units (as a decimal string) to a number of whole units. */
export const units = (raw: string | null | undefined, decimals: number) => (raw ? Number(BigInt(raw)) / 10 ** decimals : 0);

export const usdc = (raw: string | null | undefined) => int(units(raw, 6));

/** Average price from a Q96 quote-per-token ratio in base units: USDC (6 dp) per token (18 dp). */
export const priceFromX96 = (x96: string | null | undefined) => (x96 ? (Number(x96) / Q96) * 1e12 : 0);

/** A small dollar price with four significant figures, never in exponent form. */
export function dollars(p: number) {
  if (!(p > 0)) return "$0";
  if (p >= 1) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  const dp = Math.min(14, Math.ceil(-Math.log10(p)) + 3);
  return `$${p.toFixed(dp)}`;
}

/** Basis points as a percentage: two decimals under 1%, one above; whole numbers stay whole unless `fixed` (for columns). */
export function pct(bps: number, fixed = false) {
  if (bps === 0 || (!fixed && bps % 100 === 0)) return `${bps / 100}%`;
  return `${(bps / 100).toFixed(bps < 100 ? 2 : 1)}%`;
}

/** A ratio such as 12.77 as "12.8×"; close to one it keeps three decimals so 1.006× stays visible. */
export function times(r: number) {
  return `${r < 1.1 ? r.toFixed(3) : r < 10 ? r.toFixed(2) : r.toFixed(1)}×`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Unix seconds as "Oct 18, 14:01 UTC". */
export function utc(ts: number, withZone = true) {
  const d = new Date(ts * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${hh}:${mm}${withZone ? " UTC" : ""}`;
}

export function day(ts: number) {
  const d = new Date(ts * 1000);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** A span of seconds in the largest unit that reads cleanly: "10 minutes", "30 days". */
export function span(seconds: number) {
  const units: [number, string][] = [
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
    [1, "second"],
  ];
  for (const [n, name] of units) {
    if (seconds >= n && seconds % n === 0) {
      const v = seconds / n;
      return `${v} ${name}${v === 1 ? "" : "s"}`;
    }
  }
  return `${seconds} seconds`;
}
