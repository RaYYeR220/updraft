import { type Address, type Hex, isAddress } from "viem";
import type { Store } from "./store.js";

export interface DripDeps {
  store: Store;
  now: () => number;
  usdcAmount: bigint;
  gasAmount: bigint;
  /** All drips together per hour, so fresh addresses from many IPs still can't empty the funding wallet. */
  perHour: number;
  wallet: {
    mintUsdc(to: Address, amount: bigint): Promise<Hex>;
    sendGas(to: Address, amount: bigint): Promise<Hex>;
  };
}

const DAY = 86_400_000;
const HOUR = 3_600_000;

// Checks and reservations run one at a time, so concurrent requests can't all pass the same count.
let queue: Promise<unknown> = Promise.resolve();
function serially<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

/** Test funds for trying Updraft with no setup: Ascend's testnet USDC plus a little HYPE for gas. */
export async function drip(address: Address, ip: string, d: DripDeps) {
  if (!isAddress(address)) return { status: 400, body: { ok: false as const, reason: "bad_address" } };
  const refused = await serially(() => reserve(address, ip, d));
  if (refused) return refused;
  const gasTx = await d.wallet.sendGas(address, d.gasAmount);
  const mintTx = await d.wallet.mintUsdc(address, d.usdcAmount);
  return { status: 200, body: { ok: true as const, mintTx, gasTx, usdc: d.usdcAmount.toString() } };
}

/** Takes this drip's place under every limit, or says which limit refused it. */
async function reserve(address: Address, ip: string, d: DripDeps) {
  const now = d.now();
  const addrKey = `addr:${address.toLowerCase()}`;
  const ipKey = `ip:${ip}`;
  if ((await d.store.countDrips(addrKey, now - DAY)) >= 1) {
    return { status: 429, body: { ok: false as const, reason: "address_limited" } };
  }
  if ((await d.store.countDrips(ipKey, now - HOUR)) >= 5) {
    return { status: 429, body: { ok: false as const, reason: "ip_limited" } };
  }
  if ((await d.store.countDrips("all", now - HOUR)) >= d.perHour) {
    return { status: 429, body: { ok: false as const, reason: "busy" } };
  }
  await d.store.putDrip(addrKey, now);
  await d.store.putDrip(ipKey, now);
  await d.store.putDrip("all", now);
  return null;
}
