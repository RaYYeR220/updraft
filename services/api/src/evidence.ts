import { type Hex, keccak256, toBytes } from "viem";

/** JSON with sorted keys, so the same evidence always hashes the same. */
export function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  if (typeof value === "bigint") return value.toString();
  return value;
}

export function evidenceHash(json: string): Hex {
  return keccak256(toBytes(json));
}
