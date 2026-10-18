import {
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
  type WalletClient,
  concat,
  encodeAbiParameters,
  erc20Abi,
  getContractAddress,
  keccak256,
  parseSignature,
} from "viem";
import {
  ascendLaunchpadAbi,
  ascendTokenCreationCode,
  creatorVaultAbi,
  launchCertificateAbi,
  updraftFactoryAbi,
  updraftLensAbi,
  updraftRoundAbi,
  updraftStakingAbi,
} from "./generated.js";
import {
  AbortReasons,
  type Attestation,
  type Deployment,
  EMPTY_VOUCHER,
  type FirePreview,
  type Policy,
  type RoundConfig,
  type RoundState,
  Status,
  type Voucher,
} from "./types.js";

const TOTAL_SUPPLY = 10n ** 27n;

export interface UpdraftClientOptions {
  publicClient: PublicClient;
  walletClient?: WalletClient;
  deployment: Deployment;
  /** Base URL of the Updraft API (attestor), e.g. https://api.example.com */
  apiUrl?: string;
}

const permitAbi = [
  { type: "function", name: "nonces", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

/** Where Ascend will deploy a round's token, computed offline (CREATE2 salted by the round). */
export function predictToken(args: {
  launchpad: Address;
  round: Address;
  tokenSalt: Hex;
  name: string;
  symbol: string;
}): Address {
  const initCode = concat([
    ascendTokenCreationCode,
    encodeAbiParameters([{ type: "string" }, { type: "string" }, { type: "uint256" }], [args.name, args.symbol, TOTAL_SUPPLY]),
  ]);
  const salt = keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [args.round, args.tokenSalt]));
  return getContractAddress({ opcode: "CREATE2", from: args.launchpad, salt, bytecode: initCode });
}

export function createUpdraftClient({ publicClient, walletClient, deployment, apiUrl }: UpdraftClientOptions) {
  const factory = { address: deployment.factory, abi: updraftFactoryAbi } as const;
  const lens = { address: deployment.lens, abi: updraftLensAbi } as const;

  function wallet(): WalletClient & { account: NonNullable<WalletClient["account"]> } {
    if (!walletClient?.account) throw new Error("a wallet client with an account is required for writes");
    return walletClient as WalletClient & { account: NonNullable<WalletClient["account"]> };
  }

  async function write(address: Address, abi: readonly unknown[], functionName: string, args: readonly unknown[] = []): Promise<Hash> {
    const w = wallet();
    const { request } = await publicClient.simulateContract({
      address,
      abi: abi as never,
      functionName: functionName as never,
      args: args as never,
      account: w.account,
    });
    return w.writeContract(request as never);
  }

  const round = (address: Address) => ({ address, abi: updraftRoundAbi }) as const;

  async function getRound(address: Address): Promise<RoundState> {
    const r = round(address);
    const [config, status, abortReason, expectedToken, totalCommitted, participantCount, verifiedCount, preview] =
      await publicClient.multicall({
        allowFailure: false,
        contracts: [
          { ...r, functionName: "config" },
          { ...r, functionName: "status" },
          { ...r, functionName: "abortReason" },
          { ...r, functionName: "expectedToken" },
          { ...r, functionName: "totalCommitted" },
          { ...r, functionName: "participantCount" },
          { ...r, functionName: "verifiedCount" },
          { ...r, functionName: "previewFire" },
        ],
      });
    const state: RoundState = {
      address,
      config: config as unknown as RoundConfig,
      status: status as Status,
      abortReason: AbortReasons[Number(abortReason)] ?? "none",
      expectedToken,
      totalCommitted,
      participantCount: Number(participantCount),
      verifiedCount: Number(verifiedCount),
      preview: preview as FirePreview,
    };
    if (state.status === Status.Fired) {
      const [token, poolId, vault, firedAt, tokensOut, netTokens, quoteUsed, refundPool, distributedCount] =
        await publicClient.multicall({
          allowFailure: false,
          contracts: [
            { ...r, functionName: "token" },
            { ...r, functionName: "poolId" },
            { ...r, functionName: "vault" },
            { ...r, functionName: "firedAt" },
            { ...r, functionName: "tokensOut" },
            { ...r, functionName: "netTokens" },
            { ...r, functionName: "quoteUsed" },
            { ...r, functionName: "refundPool" },
            { ...r, functionName: "distributedCount" },
          ],
        });
      state.fired = {
        token,
        poolId,
        vault,
        firedAt: Number(firedAt),
        tokensOut,
        netTokens,
        quoteUsed,
        refundPool,
        distributedCount: Number(distributedCount),
      };
    }
    return state;
  }

  async function listRounds(): Promise<Address[]> {
    const count = await publicClient.readContract({ ...factory, functionName: "roundCount" });
    if (count === 0n) return [];
    const results = await publicClient.multicall({
      allowFailure: false,
      contracts: Array.from({ length: Number(count) }, (_, i) => ({ ...factory, functionName: "rounds", args: [BigInt(i)] }) as const),
    });
    return results as Address[];
  }

  /** The average price everyone would pay if `extra` more quote were committed now. */
  async function previewCommit(address: Address, extra: bigint) {
    const s = await getRound(address);
    const usable = s.preview.usable + extra;
    const effective = usable < s.config.raise.maxRaise ? usable : s.config.raise.maxRaise;
    const params = await publicClient.readContract({ ...round(address), functionName: "params" });
    const parity = (effective * BigInt(params.parityBps)) / 10_000n;
    const [tokensOut] = await publicClient.readContract({
      ...lens,
      functionName: "preview",
      args: [s.config.launchpad, s.config.quote, s.expectedToken.toLowerCase() < s.config.quote.toLowerCase(), effective - parity],
    });
    const net = tokensOut - (tokensOut * BigInt(params.platformTokenBps)) / 10_000n;
    return { effective, tokensOut, netTokens: net, avgPriceX96: net > 0n ? (effective << 96n) / net : 0n };
  }

  /** Commits quote. Uses an EIP-2612 permit when the allowance is short, so it is one transaction. */
  async function commit(address: Address, amount: bigint, attestation?: Extract<Attestation, { ok: true }>): Promise<Hash> {
    const w = wallet();
    const { quote } = (await publicClient.readContract({ ...round(address), functionName: "config" })) as unknown as RoundConfig;
    const voucher: Voucher = attestation?.voucher ?? EMPTY_VOUCHER;
    const sig: Hex = attestation?.signature ?? "0x";
    const allowance = await publicClient.readContract({
      address: quote,
      abi: erc20Abi,
      functionName: "allowance",
      args: [w.account.address, address],
    });
    if (allowance >= amount) return write(address, updraftRoundAbi, "commit", [amount, voucher, sig]);

    const [name, nonce] = await Promise.all([
      publicClient.readContract({ address: quote, abi: erc20Abi, functionName: "name" }),
      publicClient.readContract({ address: quote, abi: permitAbi, functionName: "nonces", args: [w.account.address] }),
    ]);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const signature = await w.signTypedData({
      account: w.account,
      domain: { name, version: "1", chainId: await publicClient.getChainId(), verifyingContract: quote },
      types: {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "Permit",
      message: { owner: w.account.address, spender: address, value: amount, nonce, deadline },
    });
    const { r, s, v, yParity } = parseSignature(signature);
    const vNum = v !== undefined ? Number(v) : yParity + 27;
    return write(address, updraftRoundAbi, "commitWithPermit", [amount, deadline, vNum, r, s, voucher, sig]);
  }

  async function attest(args: { round: Address; wallet: Address; hlAccount?: Address; linkSignature?: Hex }): Promise<Attestation> {
    if (!apiUrl) throw new Error("apiUrl is required to request an attestation");
    const res = await fetch(`${apiUrl}/attest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    const body = (await res.json()) as Record<string, unknown>;
    if (body.ok !== true) return { ok: false, reason: String(body.reason ?? `http_${res.status}`), evidence: body.evidence };
    const v = body.voucher as Record<string, string>;
    return {
      ok: true,
      voucher: {
        round: v.round as Address,
        wallet: v.wallet as Address,
        identityId: v.identityId as Hex,
        expiry: BigInt(v.expiry),
        evidenceHash: v.evidenceHash as Hex,
      },
      signature: body.signature as Hex,
      evidenceHash: body.evidenceHash as Hex,
    };
  }

  return {
    deployment,
    predictToken,
    predictRound: (roundSalt: Hex, deployer: Address) =>
      publicClient.readContract({ ...factory, functionName: "predictRound", args: [roundSalt, deployer] }),
    getRound,
    listRounds,
    previewFire: (address: Address) =>
      publicClient.readContract({ ...round(address), functionName: "previewFire" }) as Promise<FirePreview>,
    previewCommit,
    claimable: async (address: Address, walletAddress: Address) => {
      const [tokens, refund] = await publicClient.readContract({ ...round(address), functionName: "claimable", args: [walletAddress] });
      return { tokens, refund };
    },
    getCertificate: (token: Address) =>
      publicClient.readContract({ address: deployment.certificate, abi: launchCertificateAbi, functionName: "get", args: [token] }),
    vaultEarned: async (vault: Address, user: Address) => {
      const [quote, token] = await publicClient.readContract({ address: vault, abi: creatorVaultAbi, functionName: "earned", args: [user] });
      return { quote, token };
    },
    pendingPolicy: async (vault: Address) => {
      const [policy, eta] = await publicClient.readContract({ address: vault, abi: creatorVaultAbi, functionName: "pendingPolicy" });
      return { policy: policy as Policy, eta: Number(eta) };
    },
    attest,

    createRound: (cfg: RoundConfig, roundSalt: Hex) => write(deployment.factory, updraftFactoryAbi, "createRound", [cfg, roundSalt]),
    commit,
    withdraw: (address: Address, amount: bigint) => write(address, updraftRoundAbi, "withdraw", [amount]),
    fire: (address: Address) => write(address, updraftRoundAbi, "fire"),
    abort: (address: Address) => write(address, updraftRoundAbi, "abort"),
    refundAborted: (address: Address) => write(address, updraftRoundAbi, "refundAborted"),
    distribute: (address: Address, from: bigint, to: bigint) => write(address, updraftRoundAbi, "distribute", [from, to]),
    claim: (address: Address) => write(address, updraftRoundAbi, "claim"),
    harvest: (vault: Address) => write(vault, creatorVaultAbi, "harvest"),
    stake: (vault: Address, amount: bigint) => write(vault, creatorVaultAbi, "stake", [amount]),
    unstake: (vault: Address, amount: bigint) => write(vault, creatorVaultAbi, "unstake", [amount]),
    claimRewards: (vault: Address) => write(vault, creatorVaultAbi, "claimRewards"),
    queuePolicy: (vault: Address, policy: Policy) => write(vault, creatorVaultAbi, "queuePolicy", [policy]),
    executePolicy: (vault: Address) => write(vault, creatorVaultAbi, "executePolicy"),
    stakeDraft: (amount: bigint) => write(deployment.staking, updraftStakingAbi, "stake", [amount]),
  };
}

export type UpdraftClient = ReturnType<typeof createUpdraftClient>;
export { ascendLaunchpadAbi };
