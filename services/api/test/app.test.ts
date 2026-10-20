import { type Address, type Hex, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { DRIP_GAS_WEI, type DripDeps, drip } from "../src/drip.js";
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
    perHour: 20,
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

  it("caps all drips per hour, however many addresses and IPs ask", async () => {
    const d = dripDeps();
    for (let i = 1; i <= 20; i++) {
      const addr = `0x${i.toString(16).padStart(40, "0")}` as Address;
      expect((await drip(addr, `10.0.0.${i}`, d)).status).toBe(200);
    }
    const next = await drip(`0x${"ff".padStart(40, "0")}` as Address, "10.0.1.1", d);
    expect(next.status).toBe(429);
    expect(next.body).toMatchObject({ ok: false, reason: "busy" });
  });

  it("holds the hourly cap under concurrent requests", async () => {
    const d = dripDeps();
    const results = await Promise.all(
      Array.from({ length: 25 }, (_, i) => drip(`0x${(0xe00 + i).toString(16).padStart(40, "0")}` as Address, `10.1.0.${i}`, d)),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(20);
    expect(d.minted).toHaveLength(20);
  });

  it("gives the slot back when a transfer fails, so the address can try again", async () => {
    const d = dripDeps();
    const send = d.wallet.sendGas;
    d.wallet.sendGas = async () => {
      throw new Error("insufficient funds");
    };
    const failed = await drip(A, "1.1.1.1", d);
    expect(failed.status).toBe(503);
    expect(failed.body).toMatchObject({ ok: false, reason: "funding_failed" });
    d.wallet.sendGas = send;
    expect((await drip(A, "1.1.1.1", d)).status).toBe(200);
    expect(d.minted).toEqual([A]);
  });

  it("drips enough gas for a demo wallet to create a round and commit to it", () => {
    // Measured on Elysium testnet: createRound used 1,484,348 gas and a permit commit 236,968. A
    // wallet signs with a limit about 20% over that and a max fee of twice the 0.1 gwei base fee,
    // and the node refuses a transaction whose limit times max fee is more than the balance.
    const need = (((1_484_348n + 236_968n) * 12n) / 10n) * 200_000_000n;
    expect(DRIP_GAS_WEI >= need).toBe(true);
  });

  it("rejects a malformed address", async () => {
    const res = await drip("0x123" as Address, "1.1.1.1", dripDeps());
    expect(res.status).toBe(400);
  });
});

describe("http api", () => {
  const store = new MemoryStore();
  const attestDeps = {
    info: async () => [],
    chain: { isRound: async () => false, roundInfo: async () => ({ mode: 1, attestor: A, closeAt: 0 }), isContract: async () => false },
    explorer: { firstFunding: async () => null, txCount: async () => 0 },
    store,
    attestor: privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"),
    chainId: 99801,
    now: () => NOW,
  };
  const app = createApp({
    attestDeps,
    dripDeps: dripDeps(store),
    analysisPath: "does-not-exist.json",
  });

  it("limits drips by the IP Cloud Run saw, not one the client wrote into X-Forwarded-For", async () => {
    const post = (i: number) =>
      app.request("/drip", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${i}, 9.9.9.9` },
        body: JSON.stringify({ address: `0x${(0xd00 + i).toString(16).padStart(40, "0")}` }),
      });
    for (let i = 1; i <= 5; i++) expect((await post(i)).status).toBe(200);
    const sixth = await post(6);
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toMatchObject({ reason: "ip_limited" });
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

  it("serves stored epoch claims with proofs, and protects the run trigger", async () => {
    await store.putEpoch({
      id: 0,
      start: 1,
      end: 2,
      root: `0x${"11".repeat(32)}`,
      tx: null,
      claims: JSON.stringify([{ account: A.toLowerCase(), asset: A, amount: "5", proof: [] }]),
      tree: null,
    });
    const res = await app.request(`/epochs/claims/${A}`);
    expect(await res.json()).toEqual([{ epoch: 0, account: A.toLowerCase(), asset: A, amount: "5", proof: [] }]);
    expect((await app.request("/epochs/run", { method: "POST" })).status).toBe(401);
  });

  it("reports a posted epoch, whose basket amounts are bigints", async () => {
    const withEpochs = createApp({
      attestDeps,
      dripDeps: dripDeps(store),
      analysisPath: "does-not-exist.json",
      epochs: {
        adminToken: "secret",
        run: async () => ({ id: 0, root: `0x${"11".repeat(32)}`, claims: 1, totals: [{ asset: A, amount: 281_687_389_026_006_114_889_080n }] }),
      },
    });
    const res = await withEpochs.request("/epochs/run", { method: "POST", headers: { authorization: "Bearer secret" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, epoch: { id: 0, totals: [{ asset: A, amount: "281687389026006114889080" }] } });
  });

  it("allows cross-origin reads", async () => {
    const res = await app.request("/health", { headers: { origin: "https://example.com" } });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
