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
}

export function createApp({ attestDeps, dripDeps, analysisPath }: AppDeps) {
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
