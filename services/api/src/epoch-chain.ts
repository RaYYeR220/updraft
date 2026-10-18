import {
  type Address,
  BaseError,
  ContractFunctionRevertedError,
  type Hex,
  type PublicClient,
  type WalletClient,
  parseAbi,
  parseAbiItem,
} from "viem";
import type { EpochChain } from "./epoch-job.js";
import type { StakeEvent } from "./epochs.js";

const stakingAbi = parseAbi([
  "function available(address asset) view returns (uint256)",
  "function epochCount() view returns (uint256)",
  "function epochs(uint256) view returns (bytes32 root, uint40 start, uint40 end)",
  "function genesis() view returns (uint40)",
  "function postEpoch(bytes32 root, uint40 end, address[] assets, uint256[] amounts, string uri) returns (uint256)",
]);
const staked = parseAbiItem("event Staked(address indexed user, uint256 amount, uint256 balance, uint256 totalStaked)");
const unstaked = parseAbiItem("event Unstaked(address indexed user, uint256 amount, uint256 balance, uint256 totalStaked)");
const deposited = parseAbiItem("event Deposited(address indexed asset, address indexed from, uint256 amount)");
const factoryAbi = parseAbi(["function isRound(address) view returns (bool)"]);
const vaultAbi = parseAbi(["function round() view returns (address)"]);
const roundAbi = parseAbi(["function vault() view returns (address)"]);

type Timed = { blockTimestamp?: Hex; blockNumber: bigint | null };

export function viemEpochChain(opts: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  staking: Address;
  factory: Address;
  fromBlock: bigint;
}): EpochChain {
  const { publicClient, walletClient, staking, factory, fromBlock } = opts;
  const isSource = new Map<string, boolean>();

  async function timeOf(log: Timed): Promise<number> {
    if (log.blockTimestamp) return Number(log.blockTimestamp);
    const block = await publicClient.getBlock({ blockNumber: log.blockNumber! });
    return Number(block.timestamp);
  }

  /** A round created by the factory, or the vault such a round installed (they must point at each other). */
  async function updraftSource(from: Address): Promise<boolean> {
    const key = from.toLowerCase();
    if (isSource.has(key)) return isSource.get(key)!;
    let ok = await publicClient.readContract({ address: factory, abi: factoryAbi, functionName: "isRound", args: [from] });
    if (!ok) {
      try {
        const round = await publicClient.readContract({ address: from, abi: vaultAbi, functionName: "round" });
        const isRound = await publicClient.readContract({ address: factory, abi: factoryAbi, functionName: "isRound", args: [round] });
        const installed = isRound
          ? await publicClient.readContract({ address: round, abi: roundAbi, functionName: "vault" })
          : null;
        ok = !!installed && installed.toLowerCase() === key;
      } catch {
        ok = false;
      }
    }
    isSource.set(key, ok);
    return ok;
  }

  return {
    stakeEvents: async () => {
      const [a, b] = await Promise.all([
        publicClient.getLogs({ address: staking, event: staked, fromBlock }),
        publicClient.getLogs({ address: staking, event: unstaked, fromBlock }),
      ]);
      const out: StakeEvent[] = [];
      for (const l of [...a, ...b]) {
        out.push({ user: l.args.user!, balance: l.args.balance!, time: await timeOf(l as unknown as Timed) });
      }
      return out;
    },
    depositedAssets: async () => {
      const logs = await publicClient.getLogs({ address: staking, event: deposited, fromBlock });
      const assets = new Set<Address>();
      for (const l of logs) if (await updraftSource(l.args.from!)) assets.add(l.args.asset!);
      return [...assets];
    },
    available: async (asset) => {
      try {
        return await publicClient.readContract({ address: staking, abi: stakingAbi, functionName: "available", args: [asset] });
      } catch (e) {
        // A token whose balanceOf reverts is skipped so it cannot block every epoch; any other
        // failure (RPC, network) aborts the job so the window stays open and is retried whole.
        if (e instanceof BaseError && e.walk((x) => x instanceof ContractFunctionRevertedError)) return 0n;
        throw e;
      }
    },
    nextStart: async () => {
      const count = await publicClient.readContract({ address: staking, abi: stakingAbi, functionName: "epochCount" });
      if (count === 0n) return Number(await publicClient.readContract({ address: staking, abi: stakingAbi, functionName: "genesis" }));
      const [, , end] = await publicClient.readContract({ address: staking, abi: stakingAbi, functionName: "epochs", args: [count - 1n] });
      return Number(end);
    },
    epochCount: async () => Number(await publicClient.readContract({ address: staking, abi: stakingAbi, functionName: "epochCount" })),
    latestTimestamp: async () => Number((await publicClient.getBlock()).timestamp),
    post: async (root, end, assets, amounts, uri) => {
      const { request } = await publicClient.simulateContract({
        address: staking,
        abi: stakingAbi,
        functionName: "postEpoch",
        args: [root, end, assets, amounts, uri],
        account: walletClient.account!,
      });
      const hash = await walletClient.writeContract(request);
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },
  };
}
