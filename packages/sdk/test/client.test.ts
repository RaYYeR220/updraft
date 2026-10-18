import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Address,
  createPublicClient,
  createTestClient,
  createWalletClient,
  erc20Abi,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Deployment,
  Mode,
  type RoundConfig,
  Status,
  ascendTestnet,
  createUpdraftClient,
  elysiumTestnet,
  predictToken,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const deployment = JSON.parse(readFileSync(join(here, "..", "..", "..", "deployments", "anvil.json"), "utf8")) as Deployment;
const transport = http("http://127.0.0.1:8547", { timeout: 180_000 });
const chain = { ...elysiumTestnet, rpcUrls: { default: { http: ["http://127.0.0.1:8547"] } } };
const publicClient = createPublicClient({ chain, transport });
const testClient = createTestClient({ chain, transport, mode: "anvil" });

// anvil default accounts 1..4
const keys = [
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
] as const;
const accounts = keys.map((k) => privateKeyToAccount(k));
const wallets = accounts.map((account) => createWalletClient({ account, chain, transport }));
const clients = wallets.map((walletClient) => createUpdraftClient({ publicClient, walletClient, deployment }));
const mintAbi = parseAbi(["function mint(address to, uint256 value)"]);

async function mint(to: Address, amount: bigint) {
  const hash = await wallets[0].writeContract({ address: ascendTestnet.usdc, abi: mintAbi, functionName: "mint", args: [to, amount] });
  await publicClient.waitForTransactionReceipt({ hash });
}

async function config(creator: Address, name: string): Promise<RoundConfig> {
  const now = Number((await publicClient.getBlock()).timestamp);
  const policy = { platformBps: 1000, bidBps: 3000, stakersBps: 3000, teamBps: 3000 };
  return {
    launchpad: ascendTestnet.launchpad,
    quote: ascendTestnet.usdc,
    name,
    symbol: "SDK",
    tokenSalt: "0x0000000000000000000000000000000000000000000000000000000000000007",
    creator,
    mode: Mode.Open,
    attestor: "0x0000000000000000000000000000000000000000",
    windows: { openAt: now, lockAt: now + 3000, closeAt: now + 3600, fireBy: now + 7200 },
    raise: { minRaise: 100_000_000n, maxRaise: 50_000_000_000n, walletCap: 5_000_000_000n, creatorCap: 2_000_000_000n },
    participantVesting: { tgeBps: 10_000, cliff: 0, duration: 0 },
    creatorVesting: { tgeBps: 0, cliff: 86_400, duration: 604_800 },
    policy,
    bounds: {
      min: { platformBps: 1000, bidBps: 1000, stakersBps: 0, teamBps: 0 },
      max: { platformBps: 1000, bidBps: 6000, stakersBps: 6000, teamBps: 6000 },
      timelock: 300,
    },
    listingCap: 0n,
    exitEnabled: false,
  };
}

describe("updraft sdk on an Elysium fork", () => {
  let round: Address;

  beforeAll(async () => {
    const cfg = await config(accounts[0].address, "SDK Round");
    const salt = "0x00000000000000000000000000000000000000000000000000000000000000a1";
    const predicted = await clients[0].predictRound(salt, accounts[0].address);
    const hash = await clients[0].createRound(cfg, salt);
    await publicClient.waitForTransactionReceipt({ hash });
    round = predicted;
  });

  it("predicts the token address offline exactly as the factory does", async () => {
    const offline = predictToken({
      launchpad: ascendTestnet.launchpad,
      round,
      tokenSalt: "0x0000000000000000000000000000000000000000000000000000000000000007",
      name: "SDK Round",
      symbol: "SDK",
    });
    const state = await clients[0].getRound(round);
    expect(state.expectedToken).toBe(offline);
    expect(state.status).toBe(Status.Live);
  });

  it("commits (allowance and permit paths), fires and distributes at one price", async () => {
    const amounts = [300_000_000n, 500_000_000n, 1_200_000_000n];
    for (let i = 1; i <= 3; i++) await mint(accounts[i].address, amounts[i - 1]);

    // account 1 pre-approves; accounts 2 and 3 go through the permit path
    const approve = await wallets[1].writeContract({
      address: ascendTestnet.usdc,
      abi: erc20Abi,
      functionName: "approve",
      args: [round, amounts[0]],
    });
    await publicClient.waitForTransactionReceipt({ hash: approve });
    for (let i = 1; i <= 3; i++) {
      const hash = await clients[i].commit(round, amounts[i - 1]);
      await publicClient.waitForTransactionReceipt({ hash });
    }

    const before = await clients[0].getRound(round);
    expect(before.totalCommitted).toBe(2_000_000_000n);
    expect(before.participantCount).toBe(3);
    const preview = await clients[0].previewFire(round);
    const commitPreview = await clients[0].previewCommit(round, 0n);
    expect(commitPreview.tokensOut).toBe(preview.tokensOut);

    await testClient.increaseTime({ seconds: 3600 });
    await testClient.mine({ blocks: 1 });
    const fire = await clients[0].fire(round);
    await publicClient.waitForTransactionReceipt({ hash: fire });

    const after = await clients[0].getRound(round);
    expect(after.status).toBe(Status.Fired);
    expect(after.fired?.tokensOut).toBe(preview.tokensOut);

    const dist = await clients[0].distribute(round, 0n, 3n);
    await publicClient.waitForTransactionReceipt({ hash: dist });
    const net = after.fired!.netTokens;
    for (let i = 1; i <= 3; i++) {
      const bal = await publicClient.readContract({
        address: after.fired!.token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [accounts[i].address],
      });
      expect(bal).toBe((net * amounts[i - 1]) / 2_000_000_000n);
    }
    const cert = await clients[0].getCertificate(after.fired!.token);
    expect(cert.participants).toBe(3);
  });
});
