// The negative paths, live on Elysium testnet. Each refusal is a mined transaction a reviewer can open:
//   1. a round under its minimum aborts at close and refunds in full;
//   2. a fee-policy change outside the launch bounds reverts, an in-bounds one waits out its timelock;
//   3. the creator's own tokens can't be claimed before the cliff.
//
//   node --experimental-strip-types scripts/refusals.ts --vault 0x… [--close-in 180] [--out file.json]
//     --vault   a fired round's vault whose creator is CREATOR_PRIVATE_KEY (for the policy checks)
//
// Env: ELYSIUM_RPC, FUNDER_PRIVATE_KEY (pays gas, mints test USDC), CREATOR_PRIVATE_KEY.
import { writeFileSync } from "node:fs";
import {
  type Address,
  type Hash,
  type Hex,
  type TransactionReceipt,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  parseAbi,
  parseEther,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  type Deployment,
  Mode,
  type RoundConfig,
  ascendTestnet,
  creatorVaultAbi,
  createUpdraftClient,
  elysiumTestnet,
  elysiumTestnetDeployment,
  explorerTx,
  updraftRoundAbi,
} from "@updraft/sdk";

const args = Object.fromEntries(
  process.argv.slice(2).reduce<[string, string][]>((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const RPC = process.env.ELYSIUM_RPC ?? "https://testnet-rpc.elysium.kinetiq.xyz";
const chain = { ...elysiumTestnet, rpcUrls: { default: { http: [RPC] } } };
const transport = http(RPC, { retryCount: 6, retryDelay: 1500, timeout: 60_000 });
const publicClient = createPublicClient({ chain, transport });
const deployment = elysiumTestnetDeployment as unknown as Deployment;
const funder = createWalletClient({ account: privateKeyToAccount(process.env.FUNDER_PRIVATE_KEY as Hex), chain, transport });
const creatorAccount = privateKeyToAccount(process.env.CREATOR_PRIVATE_KEY as Hex);
const creatorWallet = createWalletClient({ account: creatorAccount, chain, transport });
const creatorClient = createUpdraftClient({ publicClient, walletClient: creatorWallet, deployment });
const mintAbi = parseAbi(["function mint(address to, uint256 value)"]);
const erc20Abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const USDC = 1_000_000n;

const log: { step: string; hash: Hash; url: string; outcome: "success" | "reverted" }[] = [];

async function record(step: string, hash: Hash, expect: "success" | "reverted"): Promise<TransactionReceipt> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== expect) throw new Error(`${step}: expected ${expect}, got ${receipt.status} (${hash})`);
  log.push({ step, hash, url: explorerTx(hash), outcome: receipt.status });
  console.log(`${step.padEnd(44)} ${receipt.status.padEnd(9)} ${explorerTx(hash)}`);
  return receipt;
}

/** Sends a call with a fixed gas limit, skipping simulation, so a refusal is mined and on the record. */
function sendUnchecked(wallet: typeof creatorWallet, to: Address, data: Hex): Promise<Hash> {
  return wallet.sendTransaction({ to, data, gas: 400_000n });
}

async function blockTime() {
  return Number((await publicClient.getBlock()).timestamp);
}

async function until(t: number) {
  while ((await blockTime()) < t) await new Promise((r) => setTimeout(r, 5_000));
}

function baseConfig(now: number, closeIn: number, name: string, symbol: string, minRaise: bigint): RoundConfig {
  return {
    launchpad: ascendTestnet.launchpad,
    quote: ascendTestnet.usdc,
    name,
    symbol,
    tokenSalt: `0x${now.toString(16).padStart(64, "0")}` as Hex,
    creator: creatorAccount.address,
    mode: Mode.Open,
    attestor: "0x0000000000000000000000000000000000000000",
    windows: { openAt: now, lockAt: now + closeIn - 30, closeAt: now + closeIn, fireBy: now + closeIn + 3600 },
    raise: { minRaise, maxRaise: 50_000n * USDC, walletCap: 5_000n * USDC, creatorCap: 2_000n * USDC, minCommit: USDC },
    participantVesting: { tgeBps: 10_000, cliff: 0, duration: 0 },
    creatorVesting: { tgeBps: 0, cliff: 600, duration: 3600 },
    policy: { platformBps: 1000, bidBps: 3000, stakersBps: 3000, teamBps: 3000 },
    bounds: {
      min: { platformBps: 1000, bidBps: 1000, stakersBps: 0, teamBps: 0 },
      max: { platformBps: 1000, bidBps: 6000, stakersBps: 6000, teamBps: 6000 },
      timelock: 300,
    },
    listingCap: 0n,
    exitEnabled: false,
  };
}

async function freshWallet(label: string, usdc: bigint) {
  const account = privateKeyToAccount(generatePrivateKey());
  await record(`gas → ${label}`, await funder.sendTransaction({ to: account.address, value: parseEther("0.0003") }), "success");
  await record(
    `mint ${Number(usdc / USDC)} USDC → ${label}`,
    await funder.writeContract({ address: ascendTestnet.usdc, abi: mintAbi, functionName: "mint", args: [account.address, usdc] }),
    "success",
  );
  const wallet = createWalletClient({ account, chain, transport });
  return { account, wallet, client: createUpdraftClient({ publicClient, walletClient: wallet, deployment }) };
}

async function createRound(cfg: RoundConfig, salt: number) {
  const roundSalt = `0x${salt.toString(16).padStart(64, "0")}` as Hex;
  const round = (await creatorClient.predictRound(roundSalt, creatorAccount.address)) as Address;
  const receipt = await record(`create round ${cfg.symbol}`, await creatorClient.createRound(cfg, roundSalt), "success");
  return { round, createdAt: receipt.blockNumber };
}

/** Sends fire() at close. The keeper may get there first; then its transaction is the one recorded. */
async function fireAtClose(round: Address, createdAt: bigint, closeAt: number, step: string) {
  await until(closeAt);
  try {
    await record(step, await creatorClient.fire(round), "success");
  } catch (err) {
    const state = await creatorClient.getRound(round);
    if (state.status === 0) throw err;
    const logs = await publicClient.getContractEvents({
      address: round,
      abi: updraftRoundAbi,
      eventName: state.status === 1 ? "Fired" : "Aborted",
      fromBlock: createdAt,
    });
    const hash = logs[0]?.transactionHash;
    if (!hash) throw err;
    await record(`${step} (sent by the keeper)`, hash, "success");
  }
}

async function abortDemo(closeIn: number) {
  const now = await blockTime();
  const cfg = baseConfig(now, closeIn, "Updraft Abort Test", "ABRT", 1_000n * USDC);
  const { round, createdAt } = await createRound(cfg, now + 11);
  const p = await freshWallet("participant", 100n * USDC);
  await record("commit 100 USDC (minimum is 1,000)", await p.client.commit(round, 100n * USDC), "success");
  await fireAtClose(round, createdAt, cfg.windows.closeAt, "fire at close → aborts, below minimum");
  const state = await creatorClient.getRound(round);
  if (state.abortReason !== "below-minimum") throw new Error(`unexpected abort reason ${state.abortReason}`);
  await record("refund the participant in full", await p.client.refundAborted(round), "success");
  const back = await publicClient.readContract({ address: ascendTestnet.usdc, abi: erc20Abi, functionName: "balanceOf", args: [p.account.address] });
  console.log(`participant holds ${Number(back) / 1e6} USDC again`);
  return { round, abortReason: state.abortReason, refunded: back.toString() };
}

async function policyDemo(vault: Address) {
  const outOfBounds = { platformBps: 1000, bidBps: 1000, stakersBps: 0, teamBps: 8000 };
  await record(
    "queue a policy with team at 80% (max 60%)",
    await sendUnchecked(creatorWallet, vault, encodeFunctionData({ abi: creatorVaultAbi, functionName: "queuePolicy", args: [outOfBounds] })),
    "reverted",
  );
  const inBounds = { platformBps: 1000, bidBps: 2000, stakersBps: 4000, teamBps: 3000 };
  await record("queue an in-bounds policy", await creatorClient.queuePolicy(vault, inBounds), "success");
  await record(
    "execute it before the timelock",
    await sendUnchecked(creatorWallet, vault, encodeFunctionData({ abi: creatorVaultAbi, functionName: "executePolicy" })),
    "reverted",
  );
  const { eta } = await creatorClient.pendingPolicy(vault);
  await until(eta);
  await record("execute it after the timelock", await creatorClient.executePolicy(vault), "success");
  return { vault, outOfBounds, inBounds };
}

async function vestingDemo(closeIn: number) {
  const now = await blockTime();
  const cfg = baseConfig(now, closeIn, "Updraft Vesting Test", "VEST", 100n * USDC);
  const { round, createdAt } = await createRound(cfg, now + 13);
  await record(
    "mint 200 USDC → creator",
    await funder.writeContract({ address: ascendTestnet.usdc, abi: mintAbi, functionName: "mint", args: [creatorAccount.address, 200n * USDC] }),
    "success",
  );
  await record("creator commits 200 USDC", await creatorClient.commit(round, 200n * USDC), "success");
  const p = await freshWallet("participant", 300n * USDC);
  await record("participant commits 300 USDC", await p.client.commit(round, 300n * USDC), "success");
  await fireAtClose(round, createdAt, cfg.windows.closeAt, "fire");
  await record(
    "creator claims before the 10-minute cliff",
    await sendUnchecked(creatorWallet, round, encodeFunctionData({ abi: updraftRoundAbi, functionName: "claim" })),
    "reverted",
  );
  return { round };
}

async function main() {
  const closeIn = Number(args["close-in"] ?? 180);
  const vault = args.vault as Address | undefined;
  if (!vault) throw new Error("--vault is required");
  const [abort, vesting] = [await abortDemo(closeIn), await vestingDemo(closeIn)];
  const policy = await policyDemo(vault);
  const out = { abort, vesting, policy, transactions: log };
  if (args.out) writeFileSync(String(args.out), JSON.stringify(out, null, 2));
}

await main();
