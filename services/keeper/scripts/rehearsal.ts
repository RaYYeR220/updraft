// Runs a complete Updraft round on Elysium testnet with fresh wallets, end to end:
// create → fund participants → commit (permit) → wait for close → fire → distribute.
// Every transaction is printed with an explorer link and written to the output file.
//
//   node --experimental-strip-types scripts/rehearsal.ts --name "Rehearsal One" --symbol REH1 \
//     --amounts 150,250,400,600 --close-in 240 [--max-raise 50000] [--min-raise 100] [--out file.json]
//     [--sniper 100]   a bot buys this many USDC through Ascend right after fire, for comparison
//
// Env: ELYSIUM_RPC, FUNDER_PRIVATE_KEY (pays gas, mints test USDC), CREATOR_PRIVATE_KEY.
import { writeFileSync } from "node:fs";
import { type Address, type Hash, type Hex, createPublicClient, createWalletClient, http, parseAbi, parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  type Deployment,
  Mode,
  type RoundConfig,
  ascendTestnet,
  createUpdraftClient,
  elysiumTestnet,
  elysiumTestnetDeployment,
  explorerTx,
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
const erc20Abi = parseAbi(["function approve(address, uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"]);
const swapperAbi = parseAbi(["function buy(address token, address quote, uint256 quoteIn, address to) returns (uint256)"]);
const launchpadAbi = parseAbi(["function currentFee(bytes32 poolId) view returns (uint24)"]);
const SWAPPER = (process.env.SWAPPER ?? "0xf16716e1De1E091724723690bd95056912D03016") as Address;

const USDC = 1_000_000n;
const amounts = String(args.amounts ?? "150,250,400,600").split(",").map((a) => BigInt(Math.round(Number(a) * 1e6)));
const log: { step: string; hash: Hash; url: string }[] = [];

async function sent(step: string, hash: Hash) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error(`${step} reverted: ${hash}`);
  log.push({ step, hash, url: explorerTx(hash) });
  console.log(`${step.padEnd(28)} ${explorerTx(hash)}`);
  return receipt;
}

async function main() {
  const now = Number((await publicClient.getBlock()).timestamp);
  const closeIn = Number(args["close-in"] ?? 240);
  const cfg: RoundConfig = {
    launchpad: ascendTestnet.launchpad,
    quote: ascendTestnet.usdc,
    name: String(args.name ?? "Updraft Rehearsal"),
    symbol: String(args.symbol ?? "REHRSL"),
    tokenSalt: `0x${now.toString(16).padStart(64, "0")}` as Hex,
    creator: creatorAccount.address,
    mode: Mode.Open,
    attestor: "0x0000000000000000000000000000000000000000",
    windows: { openAt: now, lockAt: now + closeIn - 30, closeAt: now + closeIn, fireBy: now + closeIn + 3600 },
    raise: {
      minRaise: BigInt(Number(args["min-raise"] ?? 100)) * USDC,
      maxRaise: BigInt(Number(args["max-raise"] ?? 50_000)) * USDC,
      walletCap: 5_000n * USDC,
      creatorCap: 2_000n * USDC,
      minCommit: USDC,
    },
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

  const roundSalt = `0x${(now + 7).toString(16).padStart(64, "0")}` as Hex;
  const round = (await creatorClient.predictRound(roundSalt, creatorAccount.address)) as Address;
  await sent("create round", await creatorClient.createRound(cfg, roundSalt));

  const participants = amounts.map(() => privateKeyToAccount(generatePrivateKey()));
  for (const [i, p] of participants.entries()) {
    await sent(`gas → participant ${i + 1}`, await funder.sendTransaction({ to: p.address, value: parseEther("0.0003") }));
    await sent(
      `mint USDC → participant ${i + 1}`,
      await funder.writeContract({ address: ascendTestnet.usdc, abi: mintAbi, functionName: "mint", args: [p.address, amounts[i]] }),
    );
  }
  for (const [i, p] of participants.entries()) {
    const client = createUpdraftClient({ publicClient, walletClient: createWalletClient({ account: p, chain, transport }), deployment });
    await sent(`commit ${Number(amounts[i]) / 1e6} USDC (permit)`, await client.commit(round, amounts[i]));
  }

  const state = await creatorClient.getRound(round);
  console.log(`round ${round} total ${Number(state.totalCommitted) / 1e6} USDC, token will be ${state.expectedToken}`);
  for (;;) {
    const t = Number((await publicClient.getBlock()).timestamp);
    if (t >= cfg.windows.closeAt) break;
    await new Promise((r) => setTimeout(r, 5_000));
  }
  // A sniper is ready before T0 and buys the moment the launch lands.
  const sniperAmount = args.sniper ? BigInt(Math.round(Number(args.sniper) * 1e6)) : 0n;
  const sniper = privateKeyToAccount(generatePrivateKey());
  const sniperWallet = createWalletClient({ account: sniper, chain, transport });
  if (sniperAmount > 0n) {
    await sent("gas → sniper", await funder.sendTransaction({ to: sniper.address, value: parseEther("0.0003") }));
    await sent(
      "mint USDC → sniper",
      await funder.writeContract({ address: ascendTestnet.usdc, abi: mintAbi, functionName: "mint", args: [sniper.address, sniperAmount] }),
    );
    await sent(
      "sniper approves swapper",
      await sniperWallet.writeContract({ address: ascendTestnet.usdc, abi: erc20Abi, functionName: "approve", args: [SWAPPER, sniperAmount] }),
    );
  }

  await sent("fire", await creatorClient.fire(round));
  const fired = await creatorClient.getRound(round);
  let sniperReport: Record<string, string> | undefined;
  if (sniperAmount > 0n && fired.fired) {
    const fee = await publicClient.readContract({ address: ascendTestnet.launchpad, abi: launchpadAbi, functionName: "currentFee", args: [fired.fired.poolId] });
    await sent(
      "sniper buys right after fire",
      await sniperWallet.writeContract({ address: SWAPPER, abi: swapperAbi, functionName: "buy", args: [fired.fired.token, ascendTestnet.usdc, sniperAmount, sniper.address] }),
    );
    const got = await publicClient.readContract({ address: fired.fired.token, abi: erc20Abi, functionName: "balanceOf", args: [sniper.address] });
    const batchPerUsdc = (fired.fired.netTokens * USDC) / fired.fired.quoteUsed;
    const sniperPerUsdc = (got * USDC) / sniperAmount;
    sniperReport = {
      sniper: sniper.address,
      launchFeeAtFirePips: String(fee),
      batchTokensPerUsdc: batchPerUsdc.toString(),
      sniperTokensPerUsdc: sniperPerUsdc.toString(),
      batchAdvantage: (Number(batchPerUsdc) / Number(sniperPerUsdc)).toFixed(2),
    };
    console.log(`batch got ${sniperReport.batchAdvantage}x the tokens per USDC that the sniper got`);
  }
  await sent("distribute", await creatorClient.distribute(round, 0n, BigInt(fired.participantCount)));

  const out = {
    round,
    token: fired.fired?.token,
    poolId: fired.fired?.poolId,
    vault: fired.fired?.vault,
    quoteUsed: fired.fired?.quoteUsed.toString(),
    tokensOut: fired.fired?.tokensOut.toString(),
    participants: participants.map((p, i) => ({ address: p.address, committed: amounts[i].toString() })),
    sniper: sniperReport,
    transactions: log,
  };
  if (args.out) writeFileSync(String(args.out), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ round: out.round, token: out.token, vault: out.vault }, null, 2));
}

await main();
