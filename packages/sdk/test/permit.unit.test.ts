import { type Address, domainSeparator } from "viem";
import { describe, expect, it } from "vitest";
import { permitVersion } from "../src/client.js";

const TOKEN = "0x84Cc00D13173f7016Bbab22A736dBf75A154cFE2" as Address;
const CHAIN = 99801;

/** A token that answers only the views it is given, and reverts on the rest. */
function token(views: Record<string, unknown>) {
  return {
    readContract: async ({ functionName }: { functionName: string }) => {
      if (!(functionName in views)) throw new Error("execution reverted");
      return views[functionName];
    },
  } as never;
}

describe("permitVersion", () => {
  it("uses the token's own version()", async () => {
    expect(await permitVersion(token({ version: "2" }), TOKEN, "USD Coin", CHAIN)).toBe("2");
  });

  it("finds the version that reproduces DOMAIN_SEPARATOR when the token has no version()", async () => {
    const sep = domainSeparator({ domain: { name: "USD Coin", version: "2", chainId: CHAIN, verifyingContract: TOKEN } });
    expect(await permitVersion(token({ DOMAIN_SEPARATOR: sep }), TOKEN, "USD Coin", CHAIN)).toBe("2");
  });

  it("reads Ascend's testnet Mock USDC as version 1", async () => {
    const sep = "0x94c69ed685b666bd6952f33b1b164321496dabe26ceaa9d0545e65881dbcac0d";
    const name = "Mock USDC (testnet, no dollar backing)";
    expect(await permitVersion(token({ DOMAIN_SEPARATOR: sep }), TOKEN, name, CHAIN)).toBe("1");
  });
});
