import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { type Address, type Hex, isAddress, isHex } from "viem";
import { type AttestDeps, attest } from "./attest.js";
import { type DripDeps, drip } from "./drip.js";
import { RULES_V1 } from "./rules.js";

export interface AppDeps {
  attestDeps: AttestDeps;
  dripDeps: DripDeps;
  analysisPath: string;
  epochs?: { run: () => Promise<unknown>; adminToken: string };
}

export function createApp({ attestDeps, dripDeps, analysisPath, epochs }: AppDeps) {
  const app = new Hono();
  app.use("*", cors({ origin: "*" }));

  app.get("/health", (c) => c.json({ ok: true }));
  app.get("/rules/v1", (c) => c.json(RULES_V1));

  app.get("/evidence/:hash", async (c) => {
    const hash = c.req.param("hash");
    if (!isHex(hash) || hash.length !== 66) return c.json({ ok: false, reason: "bad_hash" }, 400);
    const json = await attestDeps.store.getEvidence(hash as Hex);
    if (!json) return c.json({ ok: false, reason: "not_found" }, 404);
    return c.body(json, 200, { "content-type": "application/json" });
  });

  app.post("/attest", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const { round, wallet, hlAccount, linkSignature } = body;
    if (typeof round !== "string" || !isAddress(round) || typeof wallet !== "string" || !isAddress(wallet)) {
      return c.json({ ok: false, reason: "bad_request" }, 400);
    }
    if (hlAccount !== undefined && (typeof hlAccount !== "string" || !isAddress(hlAccount))) {
      return c.json({ ok: false, reason: "bad_request" }, 400);
    }
    const res = await attest(
      {
        round: round as Address,
        wallet: wallet as Address,
        hlAccount: hlAccount as Address | undefined,
        linkSignature: typeof linkSignature === "string" && isHex(linkSignature) ? (linkSignature as Hex) : undefined,
      },
      attestDeps,
    );
    return c.json(res.body, res.status as 200 | 400 | 503);
  });

  app.post("/drip", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const res = await drip(String(body.address ?? "") as Address, ip, dripDeps);
    return c.json(res.body, res.status as 200 | 400 | 429);
  });

  // $DRAFT basket epochs: the stored Merkle trees, so stakers can fetch their proofs.
  app.get("/epochs", async (c) => {
    const list = await attestDeps.store.listEpochs();
    return c.json(list.map(({ id, start, end, root, tx }) => ({ id, start, end, root, tx })));
  });

  app.get("/epochs/claims/:account", async (c) => {
    const account = c.req.param("account").toLowerCase();
    const out: unknown[] = [];
    for (const e of await attestDeps.store.listEpochs()) {
      for (const claim of JSON.parse(e.claims) as { account: string }[]) {
        if (claim.account.toLowerCase() === account) out.push({ epoch: e.id, ...claim });
      }
    }
    return c.json(out);
  });

  app.get("/epochs/:id", async (c) => {
    const e = await attestDeps.store.getEpoch(Number(c.req.param("id")));
    if (!e) return c.json({ ok: false, reason: "not_found" }, 404);
    return c.json({ ...e, claims: JSON.parse(e.claims), tree: e.tree ? JSON.parse(e.tree) : null });
  });

  app.post("/epochs/run", async (c) => {
    const given = Buffer.from(c.req.header("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${epochs?.adminToken ?? ""}`);
    if (!epochs || !epochs.adminToken || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return c.json({ ok: false, reason: "unauthorized" }, 401);
    }
    return c.json({ ok: true, epoch: (await epochs.run()) ?? null });
  });

  app.get("/analysis", async (c) => {
    try {
      const json = await readFile(analysisPath, "utf8");
      return c.body(json, 200, { "content-type": "application/json" });
    } catch {
      return c.json({ ok: false, reason: "not_generated" }, 404);
    }
  });

  return app;
}
