import { index, onchainTable } from "ponder";

export const round = onchainTable(
  "round",
  (t) => ({
    id: t.hex().primaryKey(),
    token: t.hex().notNull(),
    creator: t.hex().notNull(),
    launchpad: t.hex().notNull(),
    quote: t.hex().notNull(),
    mode: t.integer().notNull(),
    name: t.text().notNull(),
    symbol: t.text().notNull(),
    openAt: t.integer().notNull(),
    lockAt: t.integer().notNull(),
    closeAt: t.integer().notNull(),
    fireBy: t.integer().notNull(),
    minRaise: t.bigint().notNull(),
    maxRaise: t.bigint().notNull(),
    walletCap: t.bigint().notNull(),
    creatorCap: t.bigint().notNull(),
    minCommit: t.bigint().notNull(),
    status: t.text().notNull(),
    abortReason: t.integer(),
    totalCommitted: t.bigint().notNull(),
    participants: t.integer().notNull(),
    createdAt: t.integer().notNull(),
    createdTx: t.hex().notNull(),
    firedAt: t.integer(),
    firedTx: t.hex(),
    poolId: t.hex(),
    vault: t.hex(),
    quoteUsed: t.bigint(),
    tokensOut: t.bigint(),
    avgPriceX96: t.bigint(),
    shortfall: t.bigint(),
  }),
  (t) => ({ statusIdx: index().on(t.status), poolIdx: index().on(t.poolId), vaultIdx: index().on(t.vault) }),
);

export const commit = onchainTable(
  "commit",
  (t) => ({
    id: t.text().primaryKey(),
    round: t.hex().notNull(),
    wallet: t.hex().notNull(),
    kind: t.text().notNull(), // commit | withdraw | refund | claim
    identityId: t.hex(),
    amount: t.bigint().notNull(),
    tokens: t.bigint(),
    walletTotal: t.bigint(),
    roundTotal: t.bigint(),
    timestamp: t.integer().notNull(),
    tx: t.hex().notNull(),
  }),
  (t) => ({ roundIdx: index().on(t.round), walletIdx: index().on(t.wallet) }),
);

export const participant = onchainTable(
  "participant",
  (t) => ({
    id: t.text().primaryKey(), // round:wallet
    round: t.hex().notNull(),
    wallet: t.hex().notNull(),
    committed: t.bigint().notNull(),
    identityId: t.hex(),
    claimedTokens: t.bigint().notNull(),
    refunded: t.bigint().notNull(),
  }),
  (t) => ({ roundIdx: index().on(t.round) }),
);

export const vaultFlow = onchainTable(
  "vault_flow",
  (t) => ({
    id: t.text().primaryKey(),
    vault: t.hex().notNull(),
    round: t.hex().notNull(),
    kind: t.text().notNull(), // routed | staked | unstaked | rewards | team | policy_queued | policy_executed | policy_cancelled | exit_queued | exited | listing
    quote: t.bigint(),
    token: t.bigint(),
    actor: t.hex(),
    detail: t.json(),
    timestamp: t.integer().notNull(),
    tx: t.hex().notNull(),
  }),
  (t) => ({ vaultIdx: index().on(t.vault) }),
);

export const certificate = onchainTable("certificate", (t) => ({
  id: t.hex().primaryKey(), // token
  round: t.hex().notNull(),
  data: t.json().notNull(),
  timestamp: t.integer().notNull(),
  tx: t.hex().notNull(),
}));

export const poolSwap = onchainTable(
  "pool_swap",
  (t) => ({
    id: t.text().primaryKey(),
    round: t.hex().notNull(),
    poolId: t.hex().notNull(),
    trader: t.hex().notNull(),
    amount0: t.bigint().notNull(),
    amount1: t.bigint().notNull(),
    sqrtPriceX96: t.bigint().notNull(),
    fee: t.integer().notNull(),
    timestamp: t.integer().notNull(),
    tx: t.hex().notNull(),
  }),
  (t) => ({ roundIdx: index().on(t.round) }),
);

/** Lookups filled at fire, so vault and pool events can be tied back to their round. */
export const vaultIndex = onchainTable("vault_index", (t) => ({
  id: t.hex().primaryKey(), // vault
  round: t.hex().notNull(),
}));

export const poolIndex = onchainTable("pool_index", (t) => ({
  id: t.hex().primaryKey(), // poolId
  round: t.hex().notNull(),
  tokenIs0: t.boolean().notNull(),
}));
