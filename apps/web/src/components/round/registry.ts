import type { Address, PublicClient } from "viem";
import { launchCertificateAbi, updraftFactoryAbi } from "@updraft/sdk";
import { deployment } from "@/lib/config";

export const FACTORIES = [deployment.factory as Address];
export const REGISTRIES = [deployment.certificate as Address];

/** Which Updraft factory created `address`, or null when none did. Throws when the RPC can't tell. */
export async function findRound(pc: PublicClient, address: Address): Promise<Address | null> {
  const res = await pc.multicall({
    allowFailure: true,
    contracts: FACTORIES.map((f) => ({ address: f, abi: updraftFactoryAbi, functionName: "isRound", args: [address] }) as const),
  });
  const i = res.findIndex((r) => r.status === "success" && r.result === true);
  if (i >= 0) return FACTORIES[i];
  if (res.every((r) => r.status === "failure")) throw new Error("rpc unavailable");
  return null;
}

/** Each round's position in the factory that created it, 1-based, keyed by lowercase address. */
export async function roundNumbers(pc: PublicClient): Promise<Map<string, number>> {
  const counts = await pc.multicall({
    allowFailure: true,
    contracts: FACTORIES.map((f) => ({ address: f, abi: updraftFactoryAbi, functionName: "roundCount" }) as const),
  });
  const calls = FACTORIES.flatMap((f, i) => {
    const n = counts[i].status === "success" ? Number(counts[i].result) : 0;
    return Array.from({ length: n }, (_, k) => ({ address: f, abi: updraftFactoryAbi, functionName: "rounds", args: [BigInt(k)] }) as const);
  });
  const out = new Map<string, number>();
  if (!calls.length) return out;
  const res = await pc.multicall({ allowFailure: true, contracts: calls });
  res.forEach((r, i) => {
    if (r.status === "success") out.set((r.result as string).toLowerCase(), Number(calls[i].args[0]) + 1);
  });
  return out;
}

/** The registry holding `token`'s launch certificate, or null when none does. */
export async function findCertificate(pc: PublicClient, token: Address): Promise<Address | null> {
  const res = await pc.multicall({
    allowFailure: true,
    contracts: REGISTRIES.map((c) => ({ address: c, abi: launchCertificateAbi, functionName: "exists", args: [token] }) as const),
  });
  const i = res.findIndex((r) => r.status === "success" && r.result === true);
  if (i >= 0) return REGISTRIES[i];
  if (res.every((r) => r.status === "failure")) throw new Error("rpc unavailable");
  return null;
}
