import type { Address, Hex, PublicClient } from "viem";
import { parseAbi } from "viem";

export interface ChainReader {
  isRound(round: Address): Promise<boolean>;
  roundInfo(round: Address): Promise<{ mode: number; attestor: Address; closeAt: number }>;
  isContract(address: Address): Promise<boolean>;
}

export interface Explorer {
  /** The earliest transfer of native HYPE into `address`. */
  firstFunding(address: Address): Promise<{ from: Address; hash: Hex } | null>;
  txCount(address: Address): Promise<number>;
}

const factoryAbi = parseAbi(["function isRound(address) view returns (bool)"]);
const roundAbi = parseAbi([
  "function mode() view returns (uint8)",
  "function config() view returns ((address launchpad,address quote,string name,string symbol,bytes32 tokenSalt,address creator,uint8 mode,address attestor,(uint40 openAt,uint40 lockAt,uint40 closeAt,uint40 fireBy) windows,(uint128 minRaise,uint128 maxRaise,uint128 walletCap,uint128 creatorCap) raise,(uint16 tgeBps,uint32 cliff,uint32 duration) participantVesting,(uint16 tgeBps,uint32 cliff,uint32 duration) creatorVesting,(uint16 platformBps,uint16 bidBps,uint16 stakersBps,uint16 teamBps) policy,((uint16 platformBps,uint16 bidBps,uint16 stakersBps,uint16 teamBps) min,(uint16 platformBps,uint16 bidBps,uint16 stakersBps,uint16 teamBps) max,uint32 timelock) bounds,uint256 listingCap,bool exitEnabled))",
]);

export function viemChainReader(client: PublicClient, factory: Address): ChainReader {
  return {
    isRound: (round) => client.readContract({ address: factory, abi: factoryAbi, functionName: "isRound", args: [round] }),
    roundInfo: async (round) => {
      const cfg = await client.readContract({ address: round, abi: roundAbi, functionName: "config" });
      return { mode: cfg.mode, attestor: cfg.attestor, closeAt: Number(cfg.windows.closeAt) };
    },
    isContract: async (address) => {
      const code = await client.getCode({ address });
      return !!code && code !== "0x";
    },
  };
}

type TxRow = { from: string; to: string; value: string; hash: string; isError?: string };

/** Blockscout's Etherscan-compatible API (external + internal transfers, oldest first). */
export function blockscoutExplorer(apiBase = "https://elysium.kinetiq.xyz/api"): Explorer {
  async function list(action: "txlist" | "txlistinternal", address: Address): Promise<TxRow[]> {
    const url = `${apiBase}?module=account&action=${action}&address=${address}&sort=asc&page=1&offset=25`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`explorer ${res.status}`);
    const body = (await res.json()) as { result?: TxRow[] | string };
    return Array.isArray(body.result) ? body.result : [];
  }
  return {
    firstFunding: async (address) => {
      const [ext, int] = await Promise.all([list("txlist", address), list("txlistinternal", address)]);
      const incoming = [...ext, ...int].filter(
        (t) => t.to?.toLowerCase() === address.toLowerCase() && BigInt(t.value || "0") > 0n && t.isError !== "1",
      );
      const first = incoming[0];
      return first ? { from: first.from as Address, hash: first.hash as Hex } : null;
    },
    txCount: async (address) => {
      const base = apiBase.replace(/\/api$/, "/api/v2");
      const res = await fetch(`${base}/addresses/${address}/counters`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return 0;
      const body = (await res.json()) as { transactions_count?: string };
      return Number(body.transactions_count ?? 0);
    },
  };
}
