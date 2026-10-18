"use client";

import { type Hex, createWalletClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { API_URL, chain, rpcTransport } from "./config";

const KEY = "updraft.demo-wallet";

/**
 * A throwaway in-browser wallet for trying Updraft on testnet without installing anything.
 * The key lives in this browser only; the API's drip funds it with test USDC and a little gas.
 */
export function loadDemoKey(): Hex | null {
  try {
    return (localStorage.getItem(KEY) as Hex | null) ?? null;
  } catch {
    return null;
  }
}

export function createDemoKey(): Hex {
  const key = generatePrivateKey();
  try {
    localStorage.setItem(KEY, key);
  } catch {}
  return key;
}

export function forgetDemoKey() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

export function demoWalletClient(key: Hex) {
  return createWalletClient({ account: privateKeyToAccount(key), chain, transport: rpcTransport() });
}

export async function requestDrip(address: string): Promise<{ ok: boolean; reason?: string; mintTx?: string; gasTx?: string }> {
  const res = await fetch(`${API_URL}/drip`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });
  return res.json();
}
