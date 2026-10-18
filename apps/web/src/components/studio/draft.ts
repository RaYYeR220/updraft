import type { RoundConfig } from "@updraft/sdk";
import { type Address, type Hex, maxUint88, zeroAddress } from "viem";
import { type Dur, durSeconds, fmtDuration, fromLocalInput, pct, toUnits } from "./format";

export const STEPS = ["Token", "Windows", "Raise", "Mode", "Vesting", "Fees", "Review"] as const;

export type QuoteKey = "usdc" | "mnvdax";

export interface Draft {
  name: string;
  symbol: string;
  quote: QuoteKey;
  openNow: boolean;
  openAt: string;
  lock: Dur;
  t0: Dur;
  fireBy: Dur;
  minRaise: string;
  maxRaise: string;
  walletCap: string;
  creatorCap: string;
  minCommit: string;
  mode: 0 | 1;
  pTge: string;
  pCliff: Dur;
  pDuration: Dur;
  cCliff: Dur;
  cDuration: Dur;
  bid: number;
  stakers: number;
  team: number;
  bidMin: number;
  bidMax: number;
  stakersMin: number;
  stakersMax: number;
  teamMin: number;
  teamMax: number;
  timelock: Dur;
  listingCap: string;
  exitEnabled: boolean;
  tokenSalt: Hex;
  roundSalt: Hex;
}

export const PRESETS = [
  { id: "demo", label: "Demo: 10 minutes", lock: { v: "8", unit: "m" }, t0: { v: "2", unit: "m" }, fireBy: { v: "1", unit: "h" } },
  { id: "day", label: "One day", lock: { v: "23", unit: "h" }, t0: { v: "1", unit: "h" }, fireBy: { v: "1", unit: "d" } },
  { id: "three", label: "Three days", lock: { v: "71", unit: "h" }, t0: { v: "1", unit: "h" }, fireBy: { v: "1", unit: "d" } },
] as const satisfies readonly { id: string; label: string; lock: Dur; t0: Dur; fireBy: Dur }[];

export function randomSalt(): Hex {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return `0x${Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export function defaultDraft(): Draft {
  return {
    name: "",
    symbol: "",
    quote: "usdc",
    openNow: true,
    openAt: "",
    lock: { v: "23", unit: "h" },
    t0: { v: "1", unit: "h" },
    fireBy: { v: "1", unit: "d" },
    minRaise: "1000",
    maxRaise: "25000",
    walletCap: "1000",
    creatorCap: "1000",
    minCommit: "10",
    mode: 0,
    pTge: "100",
    pCliff: { v: "0", unit: "d" },
    pDuration: { v: "0", unit: "d" },
    cCliff: { v: "30", unit: "d" },
    cDuration: { v: "90", unit: "d" },
    bid: 3000,
    stakers: 3000,
    team: 3000,
    bidMin: 2000,
    bidMax: 5000,
    stakersMin: 2000,
    stakersMax: 5000,
    teamMin: 1000,
    teamMax: 4000,
    timelock: { v: "72", unit: "h" },
    listingCap: "0",
    exitEnabled: false,
    tokenSalt: "0x0000000000000000000000000000000000000000000000000000000000000000",
    roundSalt: "0x0000000000000000000000000000000000000000000000000000000000000000",
  };
}

export interface FactoryParams {
  parityBps: number;
  platformTokenBps: number;
  platformFeeBps: number;
  minPolicyTimelock: number;
  maxTeamBps: number;
}

/** What the deployed factory enforced when this page was built; replaced by a live read. */
export const PARAMS_FALLBACK: FactoryParams = {
  parityBps: 100,
  platformTokenBps: 50,
  platformFeeBps: 1000,
  minPolicyTimelock: 300,
  maxTeamBps: 6000,
};

export const MAX_FIRE_WINDOW = 7 * 86400;
export const MAX_PARTICIPANT_VESTING = 30 * 86400;

export interface Env {
  now: number;
  wallet: Address | null;
  launchpad: Address;
  attestor: Address;
  quote: { address: Address; symbol: string; decimals: number };
  capacity: bigint | null;
  params: FactoryParams;
  attestorAllowed: boolean | null;
  quoteAllowed: boolean | null;
}

export interface Problem {
  step: number;
  field: string;
  msg: string;
}

export interface Times {
  openAt: number;
  lockAt: number;
  closeAt: number;
  fireBy: number;
}

export interface Checked {
  problems: Problem[];
  times: Times | null;
  cfg: RoundConfig | null;
  vesting: { pTgeBps: number; pCliff: number; pDuration: number; cCliff: number; cDuration: number } | null;
  raise: { minRaise: bigint; maxRaise: bigint; walletCap: bigint; creatorCap: bigint; minCommit: bigint } | null;
  timelock: number | null;
}

/** Mirrors UpdraftFactory.createRound's checks, in the order a creator meets them. */
export function check(d: Draft, env: Env): Checked {
  const problems: Problem[] = [];
  const add = (step: number, field: string, msg: string) => problems.push({ step, field, msg });
  const q = env.quote;

  // 1. Token
  if (!d.name.trim()) add(0, "name", "Give the token a name.");
  if (!d.symbol.trim()) add(0, "symbol", "Give the token a ticker symbol.");
  if (env.quoteAllowed === false) add(0, "quote", `Ascend doesn't accept ${q.symbol} as a quote right now. Choose another.`);

  // 2. Windows
  let times: Times | null = null;
  const lock = durSeconds(d.lock);
  const t0 = durSeconds(d.t0);
  const fire = durSeconds(d.fireBy);
  const openAt = d.openNow ? env.now : fromLocalInput(d.openAt);
  if (!d.openNow && openAt === null) add(1, "openAt", "Pick the date and time commits open.");
  else if (!d.openNow && openAt !== null && openAt <= env.now) add(1, "openAt", "That time has passed. Pick a later one, or open now.");
  if (lock === null) add(1, "lock", "Enter how long commits stay open before the lock.");
  else if (lock <= 0) add(1, "lock", "The lock has to come after opening: give it at least a minute.");
  if (t0 === null) add(1, "t0", "Enter the gap between the lock and T0 (0 is allowed).");
  if (fire === null) add(1, "fireBy", "Enter how long anyone has to fire the round after T0.");
  else if (fire <= 0) add(1, "fireBy", "The fire-by time has to come after T0.");
  else if (fire > MAX_FIRE_WINDOW) add(1, "fireBy", `At most 7 days after T0; commits can't be held longer than that. This is ${fmtDuration(fire)}.`);
  if (openAt !== null && lock !== null && t0 !== null && fire !== null) {
    times = { openAt, lockAt: openAt + lock, closeAt: openAt + lock + t0, fireBy: openAt + lock + t0 + fire };
    if (times.closeAt <= env.now) add(1, "t0", "T0 must still be ahead when the round is created.");
  }

  // 3. Raise
  const minRaise = toUnits(d.minRaise, q.decimals);
  const maxRaise = toUnits(d.maxRaise, q.decimals);
  const walletCap = toUnits(d.walletCap, q.decimals);
  const creatorCap = toUnits(d.creatorCap, q.decimals);
  const minCommit = toUnits(d.minCommit, q.decimals);
  if (minRaise === null) add(2, "minRaise", `Enter the minimum raise in ${q.symbol}.`);
  else if (minRaise === 0n) add(2, "minRaise", "The minimum raise has to be above zero.");
  if (maxRaise === null) add(2, "maxRaise", `Enter the maximum raise in ${q.symbol}.`);
  else if (minRaise !== null && maxRaise < minRaise) add(2, "maxRaise", "The maximum can't be below the minimum.");
  else if (env.capacity !== null && maxRaise > env.capacity)
    add(2, "maxRaise", "That is more than Ascend's curve can absorb for this token. Lower the maximum.");
  if (walletCap === null) add(2, "walletCap", `Enter the most one wallet may commit, in ${q.symbol}.`);
  else if (walletCap === 0n) add(2, "walletCap", "The wallet cap has to be above zero.");
  if (creatorCap === null) add(2, "creatorCap", `Enter the most you may commit yourself, in ${q.symbol} (0 to stay out).`);
  if (minCommit === null) add(2, "minCommit", `Enter the smallest commit, in ${q.symbol}.`);
  else if (minCommit === 0n) add(2, "minCommit", "The smallest commit has to be above zero.");
  else if (walletCap !== null && minCommit > walletCap) add(2, "minCommit", "The smallest commit can't be larger than the wallet cap.");
  const raise =
    minRaise !== null && maxRaise !== null && walletCap !== null && creatorCap !== null && minCommit !== null
      ? { minRaise, maxRaise, walletCap, creatorCap, minCommit }
      : null;

  // 4. Mode
  if (d.mode === 1 && env.attestorAllowed === false) add(3, "mode", "The factory doesn't currently accept Updraft's attestor, so Verified rounds can't be created. Choose Open.");

  // 5. Vesting
  let vesting: Checked["vesting"] = null;
  const tgeNum = d.pTge.trim() === "" ? NaN : Number(d.pTge);
  const pTgeBps = Number.isFinite(tgeNum) ? Math.round(tgeNum * 100) : NaN;
  const allAtT0 = pTgeBps === 10_000;
  const pCliff = allAtT0 ? 0 : durSeconds(d.pCliff);
  const pDuration = allAtT0 ? 0 : durSeconds(d.pDuration);
  const cCliff = durSeconds(d.cCliff);
  const cDuration = durSeconds(d.cDuration);
  if (!Number.isFinite(pTgeBps) || pTgeBps < 0 || pTgeBps > 10_000) add(4, "pTge", "Enter a share between 0 and 100%.");
  if (pCliff === null) add(4, "pCliff", "Enter the participants' cliff (0 for none).");
  if (pDuration === null) add(4, "pDuration", "Enter how long the participants' schedule runs.");
  if (pCliff !== null && pDuration !== null) {
    if (pCliff + pDuration > MAX_PARTICIPANT_VESTING)
      add(4, "pDuration", `Participants' cliff and schedule together can be at most 30 days; this is ${fmtDuration(pCliff + pDuration)}.`);
    else if (Number.isFinite(pTgeBps) && pTgeBps < 10_000 && pDuration === 0)
      add(4, "pDuration", "With less than 100% at T0, the rest needs a schedule longer than zero.");
  }
  if (cCliff === null) add(4, "cCliff", "Enter your cliff.");
  if (cDuration === null) add(4, "cDuration", "Enter how long your schedule runs after the cliff.");
  else if (cDuration === 0) add(4, "cDuration", "Your schedule needs a length above zero.");
  if (cCliff !== null && pCliff !== null && pDuration !== null && cCliff < pCliff + pDuration)
    add(4, "cCliff", `Your cliff must last at least until every participant has fully unlocked: ${fmtDuration(pCliff + pDuration)} or more.`);
  if (Number.isFinite(pTgeBps) && pCliff !== null && pDuration !== null && cCliff !== null && cDuration !== null)
    vesting = { pTgeBps, pCliff, pDuration, cCliff, cDuration };

  // 6. Fees
  const P = env.params.platformFeeBps;
  const legs = [
    ["bid", "Ascend's bid", d.bid, d.bidMin, d.bidMax],
    ["stakers", "Stakers", d.stakers, d.stakersMin, d.stakersMax],
    ["team", "Team", d.team, d.teamMin, d.teamMax],
  ] as const;
  const sum = d.bid + d.stakers + d.team;
  if (sum + P !== 10_000) add(5, "sum", `Bid, stakers and team must add up to ${pct(10_000 - P)}; they add up to ${pct(sum)}.`);
  for (const [key, label, v, lo, hi] of legs) {
    if (lo > hi) add(5, `${key}Min`, `${label}: the lowest bound is above the highest.`);
    else if (v < lo || v > hi) add(5, key, `${label} is at ${pct(v)}, outside its bounds of ${pct(lo)} to ${pct(hi)}.`);
  }
  if (d.teamMax > env.params.maxTeamBps) add(5, "teamMax", `The team's share can never go above ${pct(env.params.maxTeamBps)}.`);
  const timelock = durSeconds(d.timelock);
  if (timelock === null) add(5, "timelock", "Enter how long a change waits before it applies.");
  else if (timelock < env.params.minPolicyTimelock)
    add(5, "timelock", `Changes must wait at least ${fmtDuration(env.params.minPolicyTimelock)}.`);
  const listingCap = toUnits(d.listingCap, q.decimals);
  if (listingCap === null) add(5, "listingCap", `Enter a listing cap in ${q.symbol}, or 0 for none.`);
  else if (listingCap > maxUint88) add(5, "listingCap", "That is larger than Ascend's listing desk accepts.");

  // 7. Review
  if (!env.wallet) add(6, "wallet", "Connect a wallet: it becomes the round's creator.");

  const cfg: RoundConfig | null =
    times && raise && vesting && timelock !== null && listingCap !== null && env.wallet
      ? {
          launchpad: env.launchpad,
          quote: q.address,
          name: d.name.trim(),
          symbol: d.symbol.trim(),
          tokenSalt: d.tokenSalt,
          creator: env.wallet,
          mode: d.mode,
          attestor: d.mode === 1 ? env.attestor : zeroAddress,
          windows: times,
          raise,
          participantVesting: { tgeBps: vesting.pTgeBps, cliff: vesting.pCliff, duration: vesting.pDuration },
          creatorVesting: { tgeBps: 0, cliff: vesting.cCliff, duration: vesting.cDuration },
          policy: { platformBps: P, bidBps: d.bid, stakersBps: d.stakers, teamBps: d.team },
          bounds: {
            min: { platformBps: P, bidBps: d.bidMin, stakersBps: d.stakersMin, teamBps: d.teamMin },
            max: { platformBps: P, bidBps: d.bidMax, stakersBps: d.stakersMax, teamBps: d.teamMax },
            timelock,
          },
          listingCap,
          exitEnabled: d.exitEnabled,
        }
      : null;

  return { problems, times, cfg, vesting, raise, timelock };
}
