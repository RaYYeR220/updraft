import { db } from "ponder:api";
import schema from "ponder:schema";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { and, client, count, desc, eq, graphql, replaceBigInts, sum } from "ponder";

const app = new Hono();
app.use("*", cors({ origin: "*" }));
app.use("/graphql", graphql({ db, schema }));
app.use("/sql/*", client({ db, schema }));

const json = <T>(value: T) => replaceBigInts(value, (v) => String(v));

app.get("/rounds", async (c) => {
  const status = c.req.query("status");
  const rows = await db
    .select()
    .from(schema.round)
    .where(status ? eq(schema.round.status, status) : undefined)
    .orderBy(desc(schema.round.createdAt));
  return c.json(json(rows));
});

app.get("/rounds/:address", async (c) => {
  const id = c.req.param("address").toLowerCase() as `0x${string}`;
  const [row] = await db.select().from(schema.round).where(eq(schema.round.id, id));
  if (!row) return c.json({ ok: false, reason: "not_found" }, 404);
  const participants = await db.select().from(schema.participant).where(eq(schema.participant.round, id));
  return c.json(json({ ...row, participantsList: participants }));
});

app.get("/rounds/:address/commits", async (c) => {
  const id = c.req.param("address").toLowerCase() as `0x${string}`;
  const rows = await db.select().from(schema.commit).where(eq(schema.commit.round, id)).orderBy(desc(schema.commit.timestamp));
  return c.json(json(rows));
});

app.get("/rounds/:address/swaps", async (c) => {
  const id = c.req.param("address").toLowerCase() as `0x${string}`;
  const rows = await db.select().from(schema.poolSwap).where(eq(schema.poolSwap.round, id)).orderBy(desc(schema.poolSwap.timestamp));
  return c.json(json(rows));
});

app.get("/certificates/:token", async (c) => {
  const id = c.req.param("token").toLowerCase() as `0x${string}`;
  const [row] = await db.select().from(schema.certificate).where(eq(schema.certificate.id, id));
  if (!row) return c.json({ ok: false, reason: "not_found" }, 404);
  return c.json(json(row));
});

app.get("/vaults/:address/flows", async (c) => {
  const id = c.req.param("address").toLowerCase() as `0x${string}`;
  const rows = await db.select().from(schema.vaultFlow).where(eq(schema.vaultFlow.vault, id)).orderBy(desc(schema.vaultFlow.timestamp));
  return c.json(json(rows));
});

app.get("/wallets/:address", async (c) => {
  const id = c.req.param("address").toLowerCase() as `0x${string}`;
  const rows = await db.select().from(schema.participant).where(eq(schema.participant.wallet, id));
  return c.json(json(rows));
});

app.get("/stats", async (c) => {
  const [rounds] = await db.select({ n: count() }).from(schema.round);
  const [fired] = await db.select({ n: count(), quote: sum(schema.round.quoteUsed) }).from(schema.round).where(eq(schema.round.status, "fired"));
  const [people] = await db.select({ n: count() }).from(schema.participant);
  const [live] = await db.select({ n: count() }).from(schema.round).where(and(eq(schema.round.status, "live")));
  return c.json(
    json({ rounds: rounds?.n ?? 0, live: live?.n ?? 0, fired: fired?.n ?? 0, quoteLaunched: fired?.quote ?? "0", participants: people?.n ?? 0 }),
  );
});

export default app;
