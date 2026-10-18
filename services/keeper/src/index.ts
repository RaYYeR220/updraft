import { readFileSync } from "node:fs";
import { type Address, type Hex, createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { type Deployment, Status, createUpdraftClient, elysiumTestnet } from "@updraft/sdk";
import { type Action, type RoundView, actionKey, plan } from "./plan.js";

const RPC = process.env.ELYSIUM_RPC ?? "https://testnet-rpc.elysium.kinetiq.xyz";
const key = process.env.KEEPER_PRIVATE_KEY as Hex | undefined;
if (!key) throw new Error("missing env KEEPER_PRIVATE_KEY");
const deploymentPath = process.env.DEPLOYMENT_FILE ?? new URL("../../../deployments/elysium-testnet.json", import.meta.url);
const deployment = JSON.parse(readFileSync(deploymentPath, "utf8")) as Deployment;
const INTERVAL_MS = Number(process.env.KEEPER_INTERVAL_MS ?? 15_000);
const MAX_TX_PER_HOUR = Number(process.env.KEEPER_MAX_TX_PER_HOUR ?? 120);
const sentAt: number[] = [];

const chain = { ...elysiumTestnet, rpcUrls: { default: { http: [RPC] } } };
const publicClient = createPublicClient({ chain, transport: http(RPC, { retryCount: 5, retryDelay: 1500 }) });
const walletClient = createWalletClient({ account: privateKeyToAccount(key), chain, transport: http(RPC) });
const updraft = createUpdraftClient({ publicClient, walletClient, deployment });

const cursors = new Map<Address, number>();
const harvestedAt = new Map<Address, number>();
const inFlight = new Set<string>();

async function snapshot(): Promise<RoundView[]> {
  const addresses = await updraft.listRounds();
  const views: RoundView[] = [];
  for (const address of addresses) {
    const s = await updraft.getRound(address);
    views.push({
      address,
      status: s.status as 0 | 1 | 2,
      totalCommitted: s.totalCommitted,
      closeAt: s.config.windows.closeAt,
      fireBy: s.config.windows.fireBy,
      participantCount: s.participantCount,
      distributeCursor: cursors.get(address) ?? 0,
      vault: s.status === Status.Fired ? (s.fired?.vault ?? null) : null,
      lastHarvestAt: harvestedAt.get(address) ?? s.fired?.firedAt ?? 0,
    });
  }
  return views;
}

async function run(a: Action) {
  const k = actionKey(a);
  inFlight.add(k);
  try {
    const hash =
      a.kind === "fire"
        ? await updraft.fire(a.round)
        : a.kind === "abort"
          ? await updraft.abort(a.round)
          : a.kind === "distribute"
            ? await updraft.distribute(a.round, a.from, a.to)
            : await updraft.harvest(a.vault);
    sentAt.push(Date.now());
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status === "success") {
      if (a.kind === "distribute") cursors.set(a.round, Number(a.to));
      if (a.kind === "harvest") harvestedAt.set(a.round, Math.floor(Date.now() / 1000));
    }
    console.log(`${a.kind} ${a.round} ${receipt.status} ${hash}`);
  } catch (e) {
    console.error(`${a.kind} ${a.round} failed: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    if (a.kind === "harvest") harvestedAt.set(a.round, Math.floor(Date.now() / 1000));
  } finally {
    inFlight.delete(k);
  }
}

async function tick() {
  try {
    const views = await snapshot();
    const now = Number((await publicClient.getBlock()).timestamp);
    for (const action of plan(views, now, inFlight)) {
      // A gas budget: rounds are permissionless, so the keeper never spends without limit.
      while (sentAt.length && sentAt[0] < Date.now() - 3_600_000) sentAt.shift();
      if (sentAt.length >= MAX_TX_PER_HOUR) {
        console.warn("hourly transaction budget reached; waiting");
        break;
      }
      await run(action);
    }
  } catch (e) {
    console.error(`tick failed: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
  }
}

console.log(`keeper for factory ${deployment.factory} as ${walletClient.account.address}`);
for (;;) {
  await tick();
  await new Promise((r) => setTimeout(r, INTERVAL_MS));
}
