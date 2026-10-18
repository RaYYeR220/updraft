import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Address, type Hex, keccak256, recoverTypedDataAddress, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { type AttestDeps, attest } from "../src/attest.js";
import { LINK_DOMAIN, LINK_TYPES } from "../src/link.js";
import { MemoryStore } from "../src/store.js";
import { VOUCHER_TYPES, voucherDomain } from "../src/voucher.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => JSON.parse(readFileSync(join(here, "fixtures", name), "utf8"));

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 18, 12, 0, 0);
const ROUND = "0x1111111111111111111111111111111111111111" as Address;
const ATTESTOR = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const CLOSE_AT = Math.floor(NOW / 1000) + 3600;

const alice = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
const bob = privateKeyToAccount("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6");
const NEW_ACCOUNT = "0x481ef824EdF8D012095E2bc7365A61bc5eD96Aff" as Address;
const FAUCET = "0xf272cc84c3ba9f1b498ade29aaeed1e7d2d9f3fd" as Address;
const PRIVATE_FUNDER = "0x2222222222222222222222222222222222222222" as Address;

/** A Hyperliquid account that clears every v1 rule: 90 days old, 40 fills, $25k volume. */
function veteranInfo(body: Record<string, unknown>) {
  switch (body.type) {
    case "userFills":
      return Array.from({ length: 40 }, (_, i) => ({ coin: "HYPE", px: "40", sz: "15", time: NOW - 80 * DAY + i * 1000 }));
    case "userNonFundingLedgerUpdates":
      return [{ time: NOW - 90 * DAY, delta: { type: "deposit", usdc: "5000" } }];
    case "portfolio":
      return [["allTime", { vlm: "25000.0", accountValueHistory: [] }]];
    case "delegatorSummary":
      return { delegated: "0.0", undelegated: "0.0", totalPendingWithdrawal: "0.0", nPendingWithdrawals: 0 };
  }
  throw new Error(`unexpected ${String(body.type)}`);
}

function newAccountInfo(body: Record<string, unknown>) {
  return fixture(`new-account.${String(body.type)}.json`);
}

function deps(over: Partial<AttestDeps> = {}): AttestDeps {
  return {
    info: async (body) => veteranInfo(body),
    chain: {
      isRound: async (r) => r === ROUND,
      roundInfo: async () => ({ mode: 1, attestor: ATTESTOR.address, closeAt: CLOSE_AT }),
      isContract: async () => false,
    },
    explorer: {
      firstFunding: async (addr) => ({ from: addr === alice.address || addr === bob.address ? PRIVATE_FUNDER : FAUCET, hash: `0x${"ab".repeat(32)}` as Hex }),
      txCount: async (addr) => (addr.toLowerCase() === FAUCET ? 215_343 : 3),
    },
    store: new MemoryStore(),
    attestor: ATTESTOR,
    chainId: 99801,
    now: () => NOW,
    ...over,
  };
}

describe("attest", () => {
  it("signs a voucher for an eligible account that verifies like the round does", async () => {
    const res = await attest({ round: ROUND, wallet: alice.address }, deps());
    expect(res.body.ok).toBe(true);
    if (!res.body.ok) return;
    const signer = await recoverTypedDataAddress({
      domain: voucherDomain(99801, ROUND),
      types: VOUCHER_TYPES,
      primaryType: "Voucher",
      message: { ...res.body.voucher, expiry: BigInt(res.body.voucher.expiry) },
      signature: res.body.signature,
    });
    expect(signer).toBe(ATTESTOR.address);
    expect(res.body.voucher.wallet).toBe(alice.address);
    expect(res.body.voucher.identityId).toBe(keccak256(toBytes(`hl:${alice.address.toLowerCase()}`)));
    expect(Number(res.body.voucher.expiry)).toBeLessThanOrEqual(CLOSE_AT);
  });

  it("refuses a too-new account, using the real recorded Hyperliquid responses", async () => {
    const res = await attest({ round: ROUND, wallet: NEW_ACCOUNT }, deps({ info: async (b) => newAccountInfo(b) }));
    expect(res.body).toMatchObject({ ok: false, reason: "too_new" });
  });

  it("refuses an old account with no real activity", async () => {
    const info = async (b: Record<string, unknown>) =>
      b.type === "userFills" ? [{ coin: "HYPE", px: "40", sz: "1", time: NOW - 60 * DAY }] : b.type === "portfolio" ? [["allTime", { vlm: "40.0" }]] : veteranInfo(b);
    const res = await attest({ round: ROUND, wallet: alice.address }, deps({ info }));
    expect(res.body).toMatchObject({ ok: false, reason: "no_activity" });
  });

  it("accepts staked HYPE as activity", async () => {
    const info = async (b: Record<string, unknown>) =>
      b.type === "userFills" ? [] : b.type === "portfolio" ? [["allTime", { vlm: "0.0" }]] : b.type === "delegatorSummary" ? { delegated: "12.5" } : veteranInfo(b);
    const res = await attest({ round: ROUND, wallet: alice.address }, deps({ info }));
    expect(res.body.ok).toBe(true);
  });

  it("refuses a second wallet funded by the same private wallet, with the funding tx as evidence", async () => {
    const d = deps();
    const first = await attest({ round: ROUND, wallet: alice.address }, d);
    expect(first.body.ok).toBe(true);
    const second = await attest({ round: ROUND, wallet: bob.address }, d);
    expect(second.body).toMatchObject({ ok: false, reason: "cluster" });
    const evidence = JSON.stringify(second.body);
    expect(evidence).toContain(PRIVATE_FUNDER);
  });

  it("never links wallets through a public hub such as the faucet", async () => {
    const d = deps({
      explorer: { firstFunding: async () => ({ from: FAUCET, hash: `0x${"cd".repeat(32)}` as Hex }), txCount: async () => 215_343 },
    });
    expect((await attest({ round: ROUND, wallet: alice.address }, d)).body.ok).toBe(true);
    expect((await attest({ round: ROUND, wallet: bob.address }, d)).body.ok).toBe(true);
  });

  it("never links wallets through a contract funder", async () => {
    const d = deps({ chain: { ...deps().chain, isContract: async () => true } });
    expect((await attest({ round: ROUND, wallet: alice.address }, d)).body.ok).toBe(true);
    expect((await attest({ round: ROUND, wallet: bob.address }, d)).body.ok).toBe(true);
  });

  it("says unavailable instead of guessing when Hyperliquid is down", async () => {
    const res = await attest({ round: ROUND, wallet: alice.address }, deps({ info: async () => { throw new Error("502"); } }));
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ ok: false, reason: "unavailable" });
  });

  it("refuses rounds it does not attest for", async () => {
    expect((await attest({ round: bob.address, wallet: alice.address }, deps())).body).toMatchObject({ ok: false, reason: "unknown_round" });
    const open = deps({ chain: { ...deps().chain, roundInfo: async () => ({ mode: 0, attestor: ATTESTOR.address, closeAt: CLOSE_AT }) } });
    expect((await attest({ round: ROUND, wallet: alice.address }, open)).body).toMatchObject({ ok: false, reason: "round_not_verified" });
    const other = deps({ chain: { ...deps().chain, roundInfo: async () => ({ mode: 1, attestor: bob.address, closeAt: CLOSE_AT }) } });
    expect((await attest({ round: ROUND, wallet: alice.address }, other)).body).toMatchObject({ ok: false, reason: "wrong_attestor" });
  });

  it("uses a linked Hyperliquid account only with a valid link signature", async () => {
    const message = { hlAccount: bob.address, wallet: alice.address, chainId: 99801n };
    const linkSignature = await bob.signTypedData({ domain: LINK_DOMAIN, types: LINK_TYPES, primaryType: "Link", message });
    const ok = await attest({ round: ROUND, wallet: alice.address, hlAccount: bob.address, linkSignature }, deps());
    expect(ok.body.ok).toBe(true);
    if (ok.body.ok) expect(ok.body.voucher.identityId).toBe(keccak256(toBytes(`hl:${bob.address.toLowerCase()}`)));

    const forged = await alice.signTypedData({ domain: LINK_DOMAIN, types: LINK_TYPES, primaryType: "Link", message });
    const bad = await attest({ round: ROUND, wallet: alice.address, hlAccount: bob.address, linkSignature: forged }, deps());
    expect(bad.body).toMatchObject({ ok: false, reason: "link_invalid" });
  });

  it("stores evidence whose hash is the voucher's evidence hash", async () => {
    const d = deps();
    const res = await attest({ round: ROUND, wallet: alice.address }, d);
    if (!res.body.ok) throw new Error("expected a voucher");
    const stored = await d.store.getEvidence(res.body.evidenceHash);
    expect(stored).not.toBeNull();
    expect(keccak256(toBytes(stored!))).toBe(res.body.evidenceHash);
    expect(res.body.voucher.evidenceHash).toBe(res.body.evidenceHash);
    expect(JSON.parse(stored!).rules).toBe("v1");
  });
});
