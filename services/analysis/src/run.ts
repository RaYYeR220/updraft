// Who got the bottom of the curve? For every launch on Ascend's testnet launchpads, measures what
// share of supply the creator (dev-buy, own buys, wallets it funded) and everyone else bought in the
// first seconds, and at what price. Deterministic for a given TO_BLOCK.
//   node --experimental-strip-types src/run.ts   (env: ELYSIUM_RPC, TO_BLOCK, WINDOW_SECONDS)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Address, type Hex, createPublicClient, http, parseAbiItem } from "viem";
import { type Buy, type Launch, type LaunchStats, aggregate, launchStats } from "./classify.ts";

const RPC = process.env.ELYSIUM_RPC ?? "https://testnet-rpc.elysium.kinetiq.xyz";
const EXPLORER = process.env.BLOCKSCOUT_API ?? "https://elysium.kinetiq.xyz/api";
const WINDOW = Number(process.env.WINDOW_SECONDS ?? 60);
const POOL_MANAGER = "0x12E84206cB53aE0df055482ebc4658635096E1aA" as Address;
const LAUNCHPADS: Address[] = [
  "0xc05193a68ED25df678bB7d6644D081BffDAA01D9",
  "0xed6E0Ca8247A697CadFDB0DeaAa2D73e061719F4",
  "0xE2f6254508DEB93Da081837F545e0bAF7b00d8E9",
  "0x6d01f6644bbf1b5074472D3e85aa1465B4d2bF3d",
];

const launchedEvent = parseAbiItem(
  "event Launched(bytes32 indexed poolId, address indexed token, address indexed creator, address quote, uint256 supplySeeded, uint256 devBuyTokens)",
);
const swapEvent = parseAbiItem(
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee, uint16 protocolFee)",
);

const client = createPublicClient({ transport: http(RPC, { timeout: 60_000, retryCount: 8, retryDelay: 2_000 }) });

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

const CACHE = join(dirname(fileURLToPath(import.meta.url)), "..", "out", "cache", "tx-senders.json");
const txFrom = new Map<string, Address>(existsSync(CACHE) ? Object.entries(JSON.parse(readFileSync(CACHE, "utf8"))) : []);
function saveSenders() {
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(Object.fromEntries(txFrom)));
}

/** Fills txFrom for many hashes with JSON-RPC batches, pacing and retrying under the RPC's rate limit. */
async function loadSenders(hashes: Hex[]) {
  const todo = [...new Set(hashes.map((h) => h.toLowerCase()))].filter((h) => !txFrom.has(h));
  for (let i = 0; i < todo.length; i += 20) {
    const chunk = todo.slice(i, i + 20);
    for (let attempt = 0; ; attempt++) {
      let body: { id: number; result?: { from: Address }; error?: unknown }[] | null = null;
      try {
        const res = await fetch(RPC, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(chunk.map((h, k) => ({ jsonrpc: "2.0", id: k, method: "eth_getTransactionByHash", params: [h] }))),
          signal: AbortSignal.timeout(30_000),
        });
        body = (await res.json()) as typeof body;
      } catch {
        body = null;
      }
      const ok = Array.isArray(body) && body.every((r) => r.result?.from);
      if (ok) {
        for (const r of body!) txFrom.set(chunk[r.id], r.result!.from);
        saveSenders();
        break;
      }
      if (attempt > 12) throw new Error(`could not load transactions ${chunk[0]}…`);
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

function senderOf(hash: Hex): Address {
  const from = txFrom.get(hash.toLowerCase());
  if (!from) throw new Error(`sender not loaded for ${hash}`);
  return from;
}

async function firstFunder(address: Address): Promise<string | null> {
  for (const action of ["txlist", "txlistinternal"]) {
    const url = `${EXPLORER}?module=account&action=${action}&address=${address}&sort=asc&page=1&offset=10`;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        const body = (await res.json()) as { result?: { from: string; to: string; value: string }[] | string };
        const rows = Array.isArray(body.result) ? body.result : [];
        const first = rows.find((r) => r.to?.toLowerCase() === address.toLowerCase() && BigInt(r.value || "0") > 0n);
        if (first) return first.from.toLowerCase();
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  return null;
}

async function main() {
  const toBlock = process.env.TO_BLOCK ? BigInt(process.env.TO_BLOCK) : await client.getBlockNumber();
  const toBlockTs = Number((await client.getBlock({ blockNumber: toBlock })).timestamp);

  const launches: (Launch & { block: bigint; tokenIs0: boolean })[] = [];
  for (const launchpad of LAUNCHPADS) {
    const logs = await client.getLogs({ address: launchpad, event: launchedEvent, fromBlock: 0n, toBlock });
    for (const l of logs) {
      launches.push({
        launchpad,
        token: l.args.token!,
        poolId: l.args.poolId!,
        creator: l.args.creator!,
        payer: "0x0000000000000000000000000000000000000000",
        quote: l.args.quote!,
        devBuyTokens: l.args.devBuyTokens!,
        devBuyQuote: 0n,
        timestamp: Number((l as unknown as { blockTimestamp: Hex }).blockTimestamp),
        tx: l.transactionHash!,
        block: l.blockNumber!,
        tokenIs0: l.args.token!.toLowerCase() < l.args.quote!.toLowerCase(),
      });
    }
  }
  console.log(`launches: ${launches.length}`);

  // All pool-manager swaps over the launch range, fetched in adaptive chunks (the public RPC rate
  // limits per request, so fewer, larger requests), then grouped by pool.
  const fromBlock = launches.reduce((m, l) => (l.block < m ? l.block : m), toBlock);
  const swaps = new Map<string, Awaited<ReturnType<typeof getSwaps>>>();
  async function getSwaps(from: bigint, to: bigint) {
    return client.getLogs({ address: POOL_MANAGER, event: swapEvent, fromBlock: from, toBlock: to });
  }
  let cursor = fromBlock;
  let span = 400_000n;
  while (cursor <= toBlock) {
    const to = cursor + span - 1n < toBlock ? cursor + span - 1n : toBlock;
    try {
      const logs = await getSwaps(cursor, to);
      for (const l of logs) {
        const id = l.args.id!.toLowerCase();
        if (!swaps.has(id)) swaps.set(id, []);
        swaps.get(id)!.push(l);
      }
      cursor = to + 1n;
    } catch (e) {
      if (span <= 1_000n) throw e;
      span /= 2n;
    }
  }
  console.log(`swaps scanned: ${[...swaps.values()].reduce((a, v) => a + v.length, 0)}`);

  // Deltas are signed from the caller's side: a buy receives tokens (positive) and pays quote
  // (negative). The dev-buy is the swap in the launch transaction whose sender is the launchpad.
  const windowHashes: Hex[] = [];
  for (const launch of launches) {
    windowHashes.push(launch.tx);
    for (const l of swaps.get(launch.poolId.toLowerCase()) ?? []) {
      const ts = Number((l as unknown as { blockTimestamp: Hex }).blockTimestamp);
      if (ts >= launch.timestamp && ts - launch.timestamp <= WINDOW) windowHashes.push(l.transactionHash!);
    }
  }
  await loadSenders(windowHashes);
  console.log(`transactions loaded: ${txFrom.size}`);

  const perLaunch = await pool(launches, 2, async (launch) => {
    launch.payer = senderOf(launch.tx);
    const buys: (Buy & { hash: Hex })[] = [];
    for (const l of swaps.get(launch.poolId.toLowerCase()) ?? []) {
      const a0 = l.args.amount0!;
      const a1 = l.args.amount1!;
      const tokenDelta = launch.tokenIs0 ? a0 : a1;
      const quoteDelta = launch.tokenIs0 ? a1 : a0;
      const ts = Number((l as unknown as { blockTimestamp: Hex }).blockTimestamp);
      if (l.args.sender!.toLowerCase() === launch.launchpad.toLowerCase() && l.transactionHash === launch.tx) {
        launch.devBuyQuote = quoteDelta < 0n ? -quoteDelta : quoteDelta;
        launch.devBuySqrtPriceX96 = l.args.sqrtPriceX96!;
        continue;
      }
      if (tokenDelta > 0n && quoteDelta < 0n && ts >= launch.timestamp && ts - launch.timestamp <= WINDOW) {
        buys.push({ buyer: "0x0000000000000000000000000000000000000000", tokens: tokenDelta, quote: -quoteDelta, timestamp: ts, tx: l.transactionHash!, hash: l.transactionHash! });
      }
    }
    for (const b of buys) b.buyer = senderOf(b.hash);
    return { launch, buys };
  });

  const buyers = [...new Set(perLaunch.flatMap((p) => p.buys.map((b) => b.buyer.toLowerCase())))] as Address[];
  console.log(`window buyers: ${buyers.length}`);
  const funded = await pool(buyers, 2, async (b) => [b, await firstFunder(b)] as const);
  const funderOf = new Map<string, string | null>(funded);

  const stats: LaunchStats[] = perLaunch
    .map(({ launch, buys }) => launchStats(launch, buys, funderOf, WINDOW))
    .sort((a, b) => a.launchedAt - b.launchedAt);

  const report = {
    generatedFromBlock: toBlock.toString(),
    generatedAtBlockTime: new Date(toBlockTs * 1000).toISOString(),
    rpc: RPC,
    windowSeconds: WINDOW,
    launchpads: LAUNCHPADS,
    poolManager: POOL_MANAGER,
    method: [
      "Launches: every Launched event on the four Ascend testnet launchpads up to the pinned block.",
      "Insiders: the dev-buy, plus buys in the window by the creator, the launch transaction's sender, or wallets whose first HYPE came from either.",
      "Others: every other buy in the window. Buyers are transaction senders; buys are pool-manager swaps that receive the token and pay the quote.",
      "Shares are of the fixed 1B supply; the price ratio compares quote paid per token by others vs insiders inside the window.",
    ],
    summary: aggregate(stats),
    launches: stats,
  };
  const here = dirname(fileURLToPath(import.meta.url));
  writeFileSync(join(here, "..", "out", "bottom-of-curve.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.summary, null, 2));
}

await main();
