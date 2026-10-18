import { type Address, type Hex, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { type DripDeps, drip } from "../src/drip.js";
import { MemoryStore } from "../src/store.js";

const NOW = Date.UTC(2026, 9, 18, 12);
const A = "0x00000000000000000000000000000000000000a1" as Address;

function dripDeps(store = new MemoryStore()): DripDeps & { minted: Address[] } {
  const minted: Address[] = [];
  return {
    store,
    minted,
    now: () => NOW,
    usdcAmount: 5_000_000_000n,
    gasAmount: 500_000_000_000_000n,
    wallet: {
      mintUsdc: async (to) => {
        minted.push(to);
        return `0x${"11".repeat(32)}` as Hex;
      },
      sendGas: async () => `0x${"22".repeat(32)}` as Hex,
    },
  };
}

describe("drip", () => {
  it("funds a fresh address once per day", async () => {
    const d = dripDeps();
    const first = await drip(A, "1.1.1.1", d);
    expect(first.status).toBe(200);
    expect(d.minted).toEqual([A]);
    const again = await drip(A, "2.2.2.2", d);
    expect(again.status).toBe(429);
    expect(again.body).toMatchObject({ ok: false, reason: "address_limited" });
  });

  it("limits one IP to five addresses an hour", async () => {
    const d = dripDeps();
    for (let i = 1; i <= 5; i++) {
      const addr = `0x${i.toString(16).padStart(40, "0")}` as Address;
      expect((await drip(addr, "9.9.9.9", d)).status).toBe(200);
    }
    const sixth = await drip(`0x${"6".padStart(40, "0")}` as Address, "9.9.9.9", d);
    expect(sixth.body).toMatchObject({ ok: false, reason: "ip_limited" });
  });

  it("rejects a malformed address", async () => {
    const res = await drip("0x123" as Address, "1.1.1.1", dripDeps());
    expect(res.status).toBe(400);
  });
});

describe("http api", () => {
  const store = new MemoryStore();
  const app = createApp({
    attestDeps: {
      info: async () => [],
      chain: { isRound: async () => false, roundInfo: async () => ({ mode: 1, attestor: A, closeAt: 0 }), isContract: async () => false },
      explorer: { firstFunding: async () => null, txCount: async () => 0 },
      store,
      attestor: privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"),
      chainId: 99801,
      now: () => NOW,
    },
    dripDeps: dripDeps(store),
    analysisPath: "does-not-exist.json",
  });

  it("serves the published rules", async () => {
    const res = await app.request("/rules/v1");
    expect(res.status).toBe(200);
    expect((await res.json()).version).toBe("v1");
  });

  it("serves evidence byte-for-byte so its hash can be re-derived", async () => {
    const json = '{"decision":"eligible","rules":"v1"}';
    const hash = keccak256(toBytes(json));
    await store.putEvidence(hash, json);
    const res = await app.request(`/evidence/${hash}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(json);
    expect((await app.request(`/evidence/0x${"00".repeat(32)}`)).status).toBe(404);
  });

  it("validates attestation requests", async () => {
    const bad = await app.request("/attest", { method: "POST", body: JSON.stringify({ round: "nope" }), headers: { "content-type": "application/json" } });
    expect(bad.status).toBe(400);
    const unknown = await app.request("/attest", {
      method: "POST",
      body: JSON.stringify({ round: A, wallet: A }),
      headers: { "content-type": "application/json" },
    });
    expect(await unknown.json()).toMatchObject({ ok: false, reason: "unknown_round" });
  });

  it("reports a missing analysis honestly", async () => {
    const res = await app.request("/analysis");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ ok: false, reason: "not_generated" });
  });

  it("allows cross-origin reads", async () => {
    const res = await app.request("/health", { headers: { origin: "https://example.com" } });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
