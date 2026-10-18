import { type Address, type Hex, type LocalAccount, isAddressEqual, keccak256, toBytes } from "viem";
import type { ChainReader, Explorer } from "./chain.js";
import { canonical, evidenceHash } from "./evidence.js";
import { HlUnavailable, type InfoFn, fetchHlFacts } from "./hl.js";
import { verifyLink } from "./link.js";
import { RULES_V1, evaluate } from "./rules.js";
import type { Store } from "./store.js";
import { VOUCHER_TYPES, voucherDomain } from "./voucher.js";

export interface AttestDeps {
  info: InfoFn;
  chain: ChainReader;
  explorer: Explorer;
  store: Store;
  attestor: LocalAccount;
  chainId: number;
  now: () => number;
}

export interface AttestRequest {
  round: Address;
  wallet: Address;
  hlAccount?: Address;
  linkSignature?: Hex;
}

export interface VoucherJson {
  round: Address;
  wallet: Address;
  identityId: Hex;
  expiry: string;
  evidenceHash: Hex;
}

export type AttestBody =
  | { ok: true; voucher: VoucherJson; signature: Hex; evidenceHash: Hex }
  | { ok: false; reason: string; evidenceHash?: Hex; evidence?: unknown };

export interface AttestResult {
  status: number;
  body: AttestBody;
}

const VOUCHER_TTL_SECONDS = 2 * 3600;

/**
 * Decides whether `wallet` may join a Verified round, and either signs a voucher or refuses with
 * the reason and the evidence behind it. A dependency that is down means "unavailable", never a guess.
 */
export async function attest(req: AttestRequest, d: AttestDeps): Promise<AttestResult> {
  const refuse = (reason: string, status = 200, evidence?: unknown): AttestResult => ({ status, body: { ok: false, reason, evidence } });

  if (!(await d.chain.isRound(req.round))) return refuse("unknown_round", 400);
  const info = await d.chain.roundInfo(req.round);
  if (info.mode !== 1) return refuse("round_not_verified", 400);
  if (!isAddressEqual(info.attestor, d.attestor.address)) return refuse("wrong_attestor", 400);

  const hlAccount = req.hlAccount ?? req.wallet;
  if (!isAddressEqual(hlAccount, req.wallet)) {
    if (!req.linkSignature || !(await verifyLink(hlAccount, req.wallet, d.chainId, req.linkSignature))) {
      return refuse("link_invalid", 400);
    }
  }

  let hl: Awaited<ReturnType<typeof fetchHlFacts>>;
  try {
    hl = await fetchHlFacts(d.info, hlAccount);
  } catch (e) {
    if (e instanceof HlUnavailable) return refuse("unavailable", 503);
    throw e;
  }

  const nowMs = d.now();
  const verdict = evaluate(hl.facts, nowMs);
  // The sybil check needs the wallet's first funding; without the explorer there is no answer, not a pass.
  let funding: Awaited<ReturnType<typeof d.explorer.firstFunding>>;
  try {
    funding = await d.explorer.firstFunding(req.wallet);
  } catch {
    return refuse("unavailable", 503);
  }
  const cluster = await clusterCheck(req, funding, d);

  const decision = !verdict.eligible ? verdict.reason : cluster ? "cluster" : "eligible";
  const evidence = {
    rules: RULES_V1.version,
    round: req.round.toLowerCase(),
    wallet: req.wallet.toLowerCase(),
    hlAccount: hlAccount.toLowerCase(),
    hyperliquid: hl.raw,
    funding: funding ? { from: funding.from.toLowerCase(), tx: funding.hash, publicHub: cluster === null && !!funding && (await isHub(funding.from, d)) } : null,
    cluster,
    decision,
    decidedAt: new Date(nowMs).toISOString(),
  };
  const json = canonical(evidence);
  const hash = evidenceHash(json);
  await d.store.putEvidence(hash, json);

  if (decision !== "eligible") return { status: 200, body: { ok: false, reason: decision, evidenceHash: hash, evidence } };

  const identityId = keccak256(toBytes(`hl:${hlAccount.toLowerCase()}`));
  const expiry = BigInt(Math.min(Math.floor(nowMs / 1000) + VOUCHER_TTL_SECONDS, info.closeAt));
  const signature = await d.attestor.signTypedData({
    domain: voucherDomain(d.chainId, req.round),
    types: VOUCHER_TYPES,
    primaryType: "Voucher",
    message: { round: req.round, wallet: req.wallet, identityId, expiry, evidenceHash: hash },
  });
  await d.store.putVoucher({
    round: req.round,
    wallet: req.wallet,
    identityId,
    funder: funding && !(await isHub(funding.from, d)) ? funding.from : null,
    evidenceHash: hash,
  });
  return {
    status: 200,
    body: {
      ok: true,
      voucher: { round: req.round, wallet: req.wallet, identityId, expiry: expiry.toString(), evidenceHash: hash },
      signature,
      evidenceHash: hash,
    },
  };
}

async function isHub(address: Address, d: AttestDeps): Promise<boolean> {
  if (await d.chain.isContract(address)) return true;
  return (await d.explorer.txCount(address)) >= RULES_V1.hubTxCount;
}

/** Same private first funder as a wallet already admitted to this round, or funded by one. */
async function clusterCheck(
  req: AttestRequest,
  funding: { from: Address; hash: Hex } | null,
  d: AttestDeps,
): Promise<{ funder: Address; fundingTx: Hex; linkedWallet: Address } | null> {
  if (!funding || (await isHub(funding.from, d))) return null;
  const admitted = await d.store.vouchersForRound(req.round);
  for (const v of admitted) {
    if (isAddressEqual(v.wallet, req.wallet)) continue;
    const sameFunder = v.funder && isAddressEqual(v.funder, funding.from);
    const fundedByAdmitted = isAddressEqual(v.wallet, funding.from);
    if (sameFunder || fundedByAdmitted) return { funder: funding.from, fundingTx: funding.hash, linkedWallet: v.wallet };
  }
  return null;
}
