import { ponder } from "ponder:registry";
import { certificate, commit, participant, poolIndex, poolSwap, round, vaultFlow, vaultIndex } from "ponder:schema";
import { replaceBigInts } from "ponder";
import { launchCertificateAbi, updraftRoundAbi } from "@updraft/sdk";

const ts = (e: { block: { timestamp: bigint } }) => Number(e.block.timestamp);
const eid = (e: { id: string }) => e.id;

ponder.on("UpdraftFactory:RoundCreated", async ({ event, context }) => {
  const cfg = await context.client.readContract({
    abi: updraftRoundAbi,
    address: event.args.round,
    functionName: "config",
    blockNumber: event.block.number,
  });
  await context.db.insert(round).values({
    id: event.args.round,
    token: event.args.token,
    creator: event.args.creator,
    launchpad: event.args.launchpad,
    quote: event.args.quote,
    mode: event.args.mode,
    name: cfg.name,
    symbol: cfg.symbol,
    openAt: Number(cfg.windows.openAt),
    lockAt: Number(cfg.windows.lockAt),
    closeAt: Number(cfg.windows.closeAt),
    fireBy: Number(cfg.windows.fireBy),
    minRaise: cfg.raise.minRaise,
    maxRaise: cfg.raise.maxRaise,
    walletCap: cfg.raise.walletCap,
    creatorCap: cfg.raise.creatorCap,
    status: "live",
    totalCommitted: 0n,
    participants: 0,
    createdAt: ts(event),
    createdTx: event.transaction.hash,
  });
});

ponder.on("UpdraftRound:Committed", async ({ event, context }) => {
  const r = event.log.address;
  const key = `${r}:${event.args.wallet}`;
  const existing = await context.db.find(participant, { id: key });
  await context.db
    .insert(participant)
    .values({
      id: key,
      round: r,
      wallet: event.args.wallet,
      committed: event.args.walletTotal,
      identityId: event.args.identityId,
      claimedTokens: 0n,
      refunded: 0n,
    })
    .onConflictDoUpdate({ committed: event.args.walletTotal });
  await context.db.insert(commit).values({
    id: eid(event),
    round: r,
    wallet: event.args.wallet,
    kind: "commit",
    identityId: event.args.identityId,
    amount: event.args.amount,
    walletTotal: event.args.walletTotal,
    roundTotal: event.args.roundTotal,
    timestamp: ts(event),
    tx: event.transaction.hash,
  });
  await context.db
    .update(round, { id: r })
    .set((row) => ({ totalCommitted: event.args.roundTotal, participants: row.participants + (existing ? 0 : 1) }));
});

ponder.on("UpdraftRound:Withdrawn", async ({ event, context }) => {
  const r = event.log.address;
  await context.db.insert(commit).values({
    id: eid(event),
    round: r,
    wallet: event.args.wallet,
    kind: "withdraw",
    amount: event.args.paid,
    roundTotal: event.args.roundTotal,
    timestamp: ts(event),
    tx: event.transaction.hash,
  });
  await context.db
    .update(participant, { id: `${r}:${event.args.wallet}` })
    .set((row) => ({ committed: row.committed - event.args.amount }));
  await context.db.update(round, { id: r }).set({ totalCommitted: event.args.roundTotal });
});

ponder.on("UpdraftRound:Shortfall", async ({ event, context }) => {
  await context.db.update(round, { id: event.log.address }).set({ shortfall: event.args.accounted - event.args.balance });
});

ponder.on("UpdraftRound:Fired", async ({ event, context }) => {
  const r = event.log.address;
  const row = await context.db.find(round, { id: r });
  await context.db.update(round, { id: r }).set({
    status: "fired",
    firedAt: ts(event),
    firedTx: event.transaction.hash,
    poolId: event.args.poolId,
    vault: event.args.vault,
    quoteUsed: event.args.quoteUsed,
    tokensOut: event.args.tokensOut,
    avgPriceX96: event.args.avgPriceX96,
  });
  await context.db.insert(vaultIndex).values({ id: event.args.vault, round: r });
  await context.db.insert(poolIndex).values({
    id: event.args.poolId,
    round: r,
    tokenIs0: row ? event.args.token.toLowerCase() < row.quote.toLowerCase() : true,
  });
});

ponder.on("UpdraftRound:Aborted", async ({ event, context }) => {
  await context.db.update(round, { id: event.log.address }).set({ status: "aborted", abortReason: event.args.reason });
});

ponder.on("UpdraftRound:Refunded", async ({ event, context }) => {
  const r = event.log.address;
  await context.db.insert(commit).values({
    id: eid(event),
    round: r,
    wallet: event.args.wallet,
    kind: "refund",
    amount: event.args.amount,
    timestamp: ts(event),
    tx: event.transaction.hash,
  });
  await context.db.update(participant, { id: `${r}:${event.args.wallet}` }).set({ refunded: event.args.amount });
});

ponder.on("UpdraftRound:Claimed", async ({ event, context }) => {
  const r = event.log.address;
  await context.db.insert(commit).values({
    id: eid(event),
    round: r,
    wallet: event.args.wallet,
    kind: "claim",
    amount: event.args.quote,
    tokens: event.args.tokens,
    timestamp: ts(event),
    tx: event.transaction.hash,
  });
  await context.db
    .update(participant, { id: `${r}:${event.args.wallet}` })
    .set((row) => ({ claimedTokens: row.claimedTokens + event.args.tokens, refunded: row.refunded + event.args.quote }));
});

ponder.on("LaunchCertificate:Certified", async ({ event, context }) => {
  const data = await context.client.readContract({
    abi: launchCertificateAbi,
    address: event.log.address,
    functionName: "get",
    args: [event.args.token],
    blockNumber: event.block.number,
  });
  await context.db.insert(certificate).values({
    id: event.args.token,
    round: event.args.round,
    data: replaceBigInts(data, (v) => String(v)),
    timestamp: ts(event),
    tx: event.transaction.hash,
  });
});

ponder.on("AscendPools:Swap", async ({ event, context }) => {
  const pool = await context.db.find(poolIndex, { id: event.args.id });
  if (!pool) return; // not an Updraft launch
  await context.db.insert(poolSwap).values({
    id: eid(event),
    round: pool.round,
    poolId: event.args.id,
    trader: event.transaction.from,
    amount0: event.args.amount0,
    amount1: event.args.amount1,
    sqrtPriceX96: event.args.sqrtPriceX96,
    fee: event.args.fee,
    timestamp: ts(event),
    tx: event.transaction.hash,
  });
});

// Vault events are matched by signature from any address; only vaults installed by an Updraft
// round are recorded.
async function vaultEvent(
  context: Parameters<Parameters<typeof ponder.on>[1]>[0]["context"],
  event: { id: string; log: { address: `0x${string}` }; block: { timestamp: bigint }; transaction: { hash: `0x${string}` } },
  kind: string,
  values: { quote?: bigint; token?: bigint; actor?: `0x${string}`; detail?: unknown },
) {
  const v = await context.db.find(vaultIndex, { id: event.log.address });
  if (!v) return;
  await context.db.insert(vaultFlow).values({
    id: event.id,
    vault: event.log.address,
    round: v.round,
    kind,
    quote: values.quote,
    token: values.token,
    actor: values.actor,
    detail: values.detail === undefined ? undefined : replaceBigInts(values.detail, (x) => String(x)),
    timestamp: Number(event.block.timestamp),
    tx: event.transaction.hash,
  });
}

ponder.on("CreatorVault:Routed", ({ event, context }) =>
  vaultEvent(context, event, "routed", { quote: event.args.quoteIncome, token: event.args.tokenIncome }),
);
ponder.on("CreatorVault:Staked", ({ event, context }) => vaultEvent(context, event, "staked", { token: event.args.amount, actor: event.args.user }));
ponder.on("CreatorVault:Unstaked", ({ event, context }) =>
  vaultEvent(context, event, "unstaked", { token: event.args.amount, actor: event.args.user }),
);
ponder.on("CreatorVault:RewardsClaimed", ({ event, context }) =>
  vaultEvent(context, event, "rewards", { quote: event.args.quote, token: event.args.token, actor: event.args.user }),
);
ponder.on("CreatorVault:TeamClaimed", ({ event, context }) =>
  vaultEvent(context, event, "team", { quote: event.args.quote, token: event.args.token, actor: event.args.to }),
);
ponder.on("CreatorVault:PolicyQueued", ({ event, context }) =>
  vaultEvent(context, event, "policy_queued", { detail: { policy: event.args.policy, eta: event.args.eta } }),
);
ponder.on("CreatorVault:PolicyExecuted", ({ event, context }) =>
  vaultEvent(context, event, "policy_executed", { detail: { policy: event.args.policy } }),
);
ponder.on("CreatorVault:PolicyCancelled", ({ event, context }) => vaultEvent(context, event, "policy_cancelled", {}));
ponder.on("CreatorVault:ExitQueued", ({ event, context }) =>
  vaultEvent(context, event, "exit_queued", { actor: event.args.to, detail: { eta: event.args.eta } }),
);
ponder.on("CreatorVault:Exited", ({ event, context }) => vaultEvent(context, event, "exited", { actor: event.args.to }));
ponder.on("CreatorVault:ListingEnrolled", ({ event, context }) =>
  vaultEvent(context, event, "listing", { quote: event.args.cap }),
);
