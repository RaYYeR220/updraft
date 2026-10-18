import { type Address, type Hex, isAddress } from "viem";
import type { Store } from "./store.js";

export interface DripDeps {
  store: Store;
  now: () => number;
  usdcAmount: bigint;
  gasAmount: bigint;
  wallet: {
    mintUsdc(to: Address, amount: bigint): Promise<Hex>;
    sendGas(to: Address, amount: bigint): Promise<Hex>;
  };
}

const DAY = 86_400_000;
const HOUR = 3_600_000;
/** All drips together, so fresh addresses from many IPs still can't empty the funding wallet. */
const PER_HOUR = 20;

/** Test funds for trying Updraft with no setup: Ascend's testnet USDC plus a little HYPE for gas. */
export async function drip(address: Address, ip: string, d: DripDeps) {
  if (!isAddress(address)) return { status: 400, body: { ok: false as const, reason: "bad_address" } };
  const now = d.now();
  const addrKey = `addr:${address.toLowerCase()}`;
  const ipKey = `ip:${ip}`;
  if ((await d.store.countDrips(addrKey, now - DAY)) >= 1) {
    return { status: 429, body: { ok: false as const, reason: "address_limited" } };
  }
  if ((await d.store.countDrips(ipKey, now - HOUR)) >= 5) {
    return { status: 429, body: { ok: false as const, reason: "ip_limited" } };
  }
  if ((await d.store.countDrips("all", now - HOUR)) >= PER_HOUR) {
    return { status: 429, body: { ok: false as const, reason: "busy" } };
  }
  await d.store.putDrip(addrKey, now);
  await d.store.putDrip(ipKey, now);
  await d.store.putDrip("all", now);
  const gasTx = await d.wallet.sendGas(address, d.gasAmount);
  const mintTx = await d.wallet.mintUsdc(address, d.usdcAmount);
  return { status: 200, body: { ok: true as const, mintTx, gasTx, usdc: d.usdcAmount.toString() } };
}
