import { type Address, type Hex, encodeFunctionData, erc20Abi } from "viem";
import { z } from "zod";
import { EMPTY_VOUCHER, type RoundConfig, type UpdraftClient, updraftFactoryAbi, updraftRoundAbi } from "@updraft/sdk";

export interface ToolDeps {
  updraft: Pick<UpdraftClient, "isRound" | "listRounds" | "getRound" | "previewCommit" | "getCertificate" | "commitOf">;
  factory: Address;
  /** Stamped on every built transaction, so a wallet signs it for the right chain. */
  chainId: number;
  analysisUrl: string;
  fetchFn?: typeof fetch;
  now?: () => number;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const uint = z.string().regex(/^\d+$/);
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

/** bigint-safe JSON: every bigint becomes a decimal string. */
function plain<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}

const policy = z.object({ platformBps: z.number(), bidBps: z.number(), stakersBps: z.number(), teamBps: z.number() });
const vesting = z.object({ tgeBps: z.number(), cliff: z.number(), duration: z.number() });
const roundConfig = z.object({
  launchpad: address,
  quote: address,
  name: z.string().min(1),
  symbol: z.string().min(1),
  tokenSalt: bytes32,
  creator: address,
  mode: z.union([z.literal(0), z.literal(1)]),
  attestor: address,
  windows: z.object({ openAt: z.number(), lockAt: z.number(), closeAt: z.number(), fireBy: z.number() }),
  raise: z.object({ minRaise: uint, maxRaise: uint, walletCap: uint, creatorCap: uint, minCommit: uint }),
  participantVesting: vesting,
  creatorVesting: vesting,
  policy,
  bounds: z.object({ min: policy, max: policy, timelock: z.number() }),
  listingCap: uint,
  exitEnabled: z.boolean(),
});

const NOT_A_ROUND = { ok: false, reason: "not_an_updraft_round" } as const;

export function buildTools({ updraft, factory, chainId, analysisUrl, fetchFn = fetch, now = () => Math.floor(Date.now() / 1000) }: ToolDeps): Tool[] {
  const tx = (to: string, data: Hex, description: string, from?: string) => ({ ...(from ? { from } : {}), to, data, value: "0", chainId, description });
  // Every tool that takes a round first checks the factory created it: an arbitrary contract could
  // otherwise impersonate a round and steer an approval to itself.
  const known = (round: unknown) => updraft.isRound(round as Address);
  return [
    {
      name: "updraft_list_rounds",
      description: "List every Updraft round (fair-launch batch on Ascend) created by the factory.",
      inputSchema: {},
      handler: async () => ({ rounds: await updraft.listRounds() }),
    },
    {
      name: "updraft_get_round",
      description:
        "Full state of one round: config, status (0 live, 1 fired, 2 aborted), total committed, participants, the fire preview (tokens the batch buys at one price) and, once fired, the token, pool, vault and amounts.",
      inputSchema: { round: address },
      handler: async ({ round }) => ((await known(round)) ? plain(await updraft.getRound(round as Address)) : NOT_A_ROUND),
    },
    {
      name: "updraft_preview_price",
      description:
        "What everyone would pay if `amount` more quote (raw units, e.g. 6-decimal USDC) were committed to the round now: effective batch, tokens out, net tokens and average price (Q64.96).",
      inputSchema: { round: address, amount: uint },
      handler: async ({ round, amount }) =>
        (await known(round)) ? plain(await updraft.previewCommit(round as Address, BigInt(amount as string))) : NOT_A_ROUND,
    },
    {
      name: "updraft_get_certificate",
      description:
        "The on-chain launch certificate for a token launched through Updraft: participants, verified identities, top-1/top-10 concentration, the dev's vesting, the fee policy hash, shortfall.",
      inputSchema: { token: address },
      handler: async ({ token }) => plain(await updraft.getCertificate(token as Address)),
    },
    {
      name: "updraft_bottom_of_curve",
      description:
        "Reproducible analysis of every launch on Ascend's testnet launchpads: who bought the bottom of the curve (dev-buy, creator-funded wallets, everyone else), what share of supply and at what price.",
      inputSchema: {},
      handler: async () => {
        const res = await fetchFn(analysisUrl);
        if (!res.ok) return { ok: false, reason: `analysis unavailable (${res.status})` };
        return res.json();
      },
    },
    {
      name: "updraft_build_commit_tx",
      description:
        "Build the unsigned transactions for `wallet` to commit `amount` (raw quote units) into an Open round: an ERC-20 approve and the commit. Never signs or sends anything.",
      inputSchema: { round: address, wallet: address, amount: uint },
      handler: async ({ round, wallet, amount }) => {
        if (!(await known(round))) return NOT_A_ROUND;
        const state = await updraft.getRound(round as Address);
        const t = now();
        const w = state.config.windows as { openAt?: number; closeAt: number };
        if (state.status !== 0 || t >= w.closeAt || (w.openAt !== undefined && t < w.openAt)) {
          return { ok: false, reason: "round_not_open" };
        }
        // A Verified round needs the attestor's voucher, which only the wallet's owner can request.
        if (state.config.mode !== 0) return { ok: false, reason: "verified_round_needs_attestation" };
        const value = BigInt(amount as string);
        // The same checks commit() makes, so an agent hears why before it pays gas for a revert.
        const r = state.config.raise;
        if (value < r.minCommit || value === 0n) return { ok: false, reason: "below_min_commit", minCommit: r.minCommit.toString() };
        if (state.preview.usable < state.totalCommitted) return { ok: false, reason: "escrow_short" };
        const isCreator = (wallet as string).toLowerCase() === state.config.creator.toLowerCase();
        const cap = isCreator ? r.creatorCap : r.walletCap;
        const already = await updraft.commitOf(round as Address, wallet as Address);
        if (already + value > cap) {
          return { ok: false, reason: isCreator ? "over_creator_cap" : "over_wallet_cap", room: (cap > already ? cap - already : 0n).toString() };
        }
        return {
          transactions: [
            tx(
              state.config.quote,
              encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [round as Address, value] }),
              `approve ${value} of the quote to the round`,
              wallet as string,
            ),
            tx(
              round as string,
              encodeFunctionData({ abi: updraftRoundAbi, functionName: "commit", args: [value, EMPTY_VOUCHER, "0x"] }),
              `commit ${value} into the round`,
              wallet as string,
            ),
          ],
        };
      },
    },
    {
      name: "updraft_build_create_round_tx",
      description:
        "Build the unsigned UpdraftFactory.createRound transaction from a JSON round config (amounts as decimal strings, times as unix seconds). Never signs or sends anything.",
      inputSchema: { config: roundConfig, roundSalt: bytes32 },
      handler: async ({ config, roundSalt }) => {
        const c = roundConfig.parse(config);
        const cfg: RoundConfig = {
          ...c,
          launchpad: c.launchpad as Address,
          quote: c.quote as Address,
          creator: c.creator as Address,
          attestor: c.attestor as Address,
          tokenSalt: c.tokenSalt as Hex,
          raise: {
            minRaise: BigInt(c.raise.minRaise),
            maxRaise: BigInt(c.raise.maxRaise),
            walletCap: BigInt(c.raise.walletCap),
            creatorCap: BigInt(c.raise.creatorCap),
            minCommit: BigInt(c.raise.minCommit),
          },
          listingCap: BigInt(c.listingCap),
        };
        return {
          transaction: tx(
            factory,
            encodeFunctionData({ abi: updraftFactoryAbi, functionName: "createRound", args: [cfg, roundSalt as Hex] }),
            `create round ${c.name} (${c.symbol})`,
          ),
        };
      },
    },
  ];
}
