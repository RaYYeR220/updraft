import type { Metadata } from "next";
import Link from "next/link";
import { type Address, type Hex, createPublicClient, encodeAbiParameters, getAddress, http, isAddress, keccak256 } from "viem";
import {
  type RoundConfig,
  ascendTestnet,
  explorerAddress,
  explorerTx,
  launchCertificateAbi,
  updraftRoundAbi,
} from "@updraft/sdk";
import { Seal, WireArt } from "@/components/round/birds";
import { CertificateVesting } from "@/components/round/CertificateVesting";
import { findCertificate, roundNumbers } from "@/components/round/registry";
import {
  type VestingLike,
  ZERO_ADDRESS,
  ZERO_HASH,
  durationAdj,
  isRehearsal,
  pct,
  price,
  priceFromX96,
  short,
  tokens,
  usdc,
  vesting,
  whenFull,
} from "@/components/round/format";
import { API_URL, RPC_URL, chain } from "@/lib/config";
import { indexer } from "@/lib/data";
import "@/styles/certificate.css";

type Props = { params: Promise<{ token: string }> };

interface Cert {
  round: Address;
  token: Address;
  poolId: Hex;
  launchpad: Address;
  quote: Address;
  firedAt: number;
  quoteUsed: bigint;
  tokensOut: bigint;
  platformTokens: bigint;
  avgPriceX96: bigint;
  participants: number;
  verifiedIdentities: number;
  top1Bps: number;
  top10Bps: number;
  creatorTokens: bigint;
  creatorVesting: VestingLike;
  participantVesting: VestingLike;
  policyHash: Hex;
  attestor: Address;
  evidenceAccumulator: Hex;
  shortfall: bigint;
}

const client = () => createPublicClient({ chain, transport: http(RPC_URL) });

const POLICY = {
  type: "tuple",
  components: [
    { name: "platformBps", type: "uint16" },
    { name: "bidBps", type: "uint16" },
    { name: "stakersBps", type: "uint16" },
    { name: "teamBps", type: "uint16" },
  ],
} as const;

/** The same hash the round writes at fire: the fee policy, its bounds and timelock, exit and listing. */
function policyHashOf(c: RoundConfig): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        POLICY,
        { type: "tuple", components: [{ ...POLICY, name: "min" }, { ...POLICY, name: "max" }, { name: "timelock", type: "uint32" }] },
        { type: "bool" },
        { type: "uint256" },
      ],
      [c.policy, c.bounds, c.exitEnabled, c.listingCap],
    ),
  );
}

function fromIndexer(d: Record<string, unknown>): Cert {
  const v = (x: unknown) => x as { tgeBps: number; cliff: number; duration: number };
  const b = (x: unknown) => BigInt(String(x ?? 0));
  return {
    round: d.round as Address,
    token: d.token as Address,
    poolId: d.poolId as Hex,
    launchpad: d.launchpad as Address,
    quote: d.quote as Address,
    firedAt: Number(d.firedAt),
    quoteUsed: b(d.quoteUsed),
    tokensOut: b(d.tokensOut),
    platformTokens: b(d.platformTokens),
    avgPriceX96: b(d.avgPriceX96),
    participants: Number(d.participants),
    verifiedIdentities: Number(d.verifiedIdentities),
    top1Bps: Number(d.top1Bps),
    top10Bps: Number(d.top10Bps),
    creatorTokens: b(d.creatorTokens),
    creatorVesting: v(d.creatorVesting),
    participantVesting: v(d.participantVesting),
    policyHash: d.policyHash as Hex,
    attestor: d.attestor as Address,
    evidenceAccumulator: d.evidenceAccumulator as Hex,
    shortfall: b(d.shortfall),
  };
}

/** Reads the certificate from the chain; the indexer's copy stands in only when the RPC is down. */
async function load(token: Address) {
  const pc = client();
  let cert: Cert | null = null;
  let source: "chain" | "indexer" = "chain";
  let registry: Address | null = null;
  try {
    registry = await findCertificate(pc, token);
    if (registry) {
      cert = (await pc.readContract({ address: registry, abi: launchCertificateAbi, functionName: "get", args: [token] })) as unknown as Cert;
    }
  } catch {
    const row = await indexer.certificate(token);
    if (row) {
      cert = fromIndexer(row.data);
      source = "indexer";
    }
  }
  if (!cert) return null;
  const round = cert.round;
  const [config, row, number] = await Promise.all([
    pc
      .readContract({ address: round, abi: updraftRoundAbi, functionName: "config" })
      .then((c) => c as unknown as RoundConfig)
      .catch(() => null),
    indexer.round(round),
    roundNumbers(pc)
      .then((m) => m.get(round.toLowerCase()) ?? 0)
      .catch(() => 0),
  ]);
  return { cert, config, row, number, source, registry };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  if (!isAddress(token, { strict: false })) return { title: "Certificate not found" };
  const row = await indexer.certificate(token);
  const round = row ? await indexer.round(row.round) : null;
  return round
    ? {
        title: `${round.name} ($${round.symbol}) launch certificate`,
        description: `The on-chain record of the ${round.name} launch on Ascend: participants, concentration, everyone's price, the creator's vesting and the fee policy.`,
      }
    : { title: "Launch certificate" };
}

export default async function CertificatePage({ params }: Props) {
  const { token: raw } = await params;
  if (!isAddress(raw, { strict: false })) return <Missing token={raw} />;
  const token = getAddress(raw.toLowerCase());
  const data = await load(token);
  if (!data) return <Missing token={token} />;
  const { cert: c, config, row, number, source, registry } = data;

  const name = config?.name ?? row?.name ?? "Unnamed";
  const symbol = config?.symbol ?? row?.symbol ?? "TOKEN";
  const toRound = c.tokensOut - c.platformTokens;
  const avg = priceFromX96(c.avgPriceX96);
  const verified = c.attestor !== ZERO_ADDRESS;
  const rehearsal = config ? isRehearsal(config.creator) : row ? isRehearsal(row.creator) : false;
  const recomputed = config ? policyHashOf(config) : null;
  const matches = recomputed?.toLowerCase() === c.policyHash.toLowerCase();
  const creatorShare = toRound > 0n ? Number((c.creatorTokens * 1_000_000n) / toRound) / 10_000 : 0;
  const instant = (v: VestingLike) => v.tgeBps >= 10_000 || (v.cliff === 0 && v.duration === 0);
  const p = config?.policy;

  return (
    <main className="ct">
      <p className="crumbs">
        <Link href="/rounds">Rounds</Link> / <Link href={`/rounds/${c.round}`}>{name}</Link> / Certificate
      </p>

      <article className="ct-plate" aria-labelledby="ct-title">
        <header className="ct-top">
          <div>
            <p className="cap">
              Updraft launch certificate
              {number ? (
                <>
                  , <b className="num">Plate No. {String(number).padStart(4, "0")}</b>
                </>
              ) : null}
            </p>
            <h1 id="ct-title">
              {name}
              <small>${symbol}</small>
            </h1>
            <p className="cap ct-bin">
              Fired {whenFull(c.firedAt)} in one transaction, on Ascend, Elysium testnet.
              {rehearsal ? " A rehearsal by the Updraft team." : ""}
            </p>
            <div className="ct-chips">
              <span className="chip">{verified ? "Verified round" : "Open round"}</span>
              {rehearsal && <span className="chip ex">Rehearsal</span>}
              <span className="chip ex">{source === "chain" ? "Read from the chain just now" : "From Updraft's indexer; the chain didn't answer"}</span>
            </div>
          </div>
          <Seal className="ct-seal" id="ct-seal-ring" />
        </header>

        <div className="ct-art">
          <WireArt birds={c.participants} labels={false} width={900} height={84} />
          <p className="cap">
            {c.participants} {verified ? "Hyperliquid accounts" : "wallets"} on one wire, all at {price(avg)} a token.
          </p>
        </div>

        <div className="ct-figs">
          <section className="ct-fig" aria-labelledby="fig1">
            <div className="fig-head">
              <span className="fig-n">1</span>
              <div>
                <h2 id="fig1">Who took part</h2>
                <p className="cap">How the batch was spread, measured on the commits at T0.</p>
              </div>
            </div>
            <dl className="facts">
              <div>
                <dt>Participants</dt>
                <dd>{c.participants}</dd>
              </div>
              <div>
                <dt>Verified identities</dt>
                <dd>{verified ? `${c.verifiedIdentities} Hyperliquid accounts` : "none: open round"}</dd>
              </div>
            </dl>
            <div className="conc">
              <Meter label="Largest single wallet" bps={c.top1Bps} />
              <Meter label="Ten largest wallets" bps={c.top10Bps} />
            </div>
            <p className="fine">
              Shares of everything committed. With {c.participants} participant{c.participants === 1 ? "" : "s"}, the ten largest are
              {c.participants <= 10 ? " everyone, so 100% is expected." : " a tenth of the round or less."}
            </p>
          </section>

          <section className="ct-fig" aria-labelledby="fig2">
            <div className="fig-head">
              <span className="fig-n">2</span>
              <div>
                <h2 id="fig2">The batch</h2>
                <p className="cap">One buy at T0, at one average price for everyone.</p>
              </div>
            </div>
            <dl className="facts">
              <div>
                <dt>USDC used</dt>
                <dd>{usdc(c.quoteUsed)}</dd>
              </div>
              <div>
                <dt>Tokens bought</dt>
                <dd>
                  {tokens(c.tokensOut)} {symbol}
                </dd>
              </div>
              <div>
                <dt>Platform cut, to $DRAFT stakers</dt>
                <dd>
                  {tokens(c.platformTokens)} {symbol}
                  {c.tokensOut > 0n && <small> {pct(Number((c.platformTokens * 10_000n) / c.tokensOut), 2)}</small>}
                </dd>
              </div>
              <div>
                <dt>To the round</dt>
                <dd>
                  {tokens(toRound)} {symbol}
                </dd>
              </div>
              <div className="hi">
                <dt>Everyone's price</dt>
                <dd>{price(avg)}</dd>
              </div>
              <div>
                <dt>Shortfall</dt>
                <dd>{c.shortfall > 0n ? `${usdc(c.shortfall)} USDC` : "none"}</dd>
              </div>
            </dl>
            <p className="fine">
              {c.shortfall > 0n
                ? "The escrow held less than was committed when the round fired; the difference is recorded here and was shared pro-rata."
                : "The escrow held every committed dollar when the round fired."}
            </p>
          </section>

          <section className="ct-fig" aria-labelledby="fig3">
            <div className="fig-head">
              <span className="fig-n">3</span>
              <div>
                <h2 id="fig3">Vesting, in public</h2>
                <p className="cap">Fixed when the round was created; the tokens wait in the round until they unlock.</p>
              </div>
            </div>
            <dl className="facts">
              <div>
                <dt>Creator's tokens</dt>
                <dd>
                  {tokens(c.creatorTokens)} {symbol}
                  <small> {creatorShare.toFixed(1)}% of the round</small>
                </dd>
              </div>
              <div>
                <dt>Creator's schedule</dt>
                <dd>{vesting(c.creatorVesting)}</dd>
              </div>
              <div>
                <dt>Participants' schedule</dt>
                <dd>{vesting(c.participantVesting)}</dd>
              </div>
            </dl>
            {!(instant(c.creatorVesting) && instant(c.participantVesting)) && (
              <CertificateVesting firedAt={c.firedAt} creator={c.creatorVesting} participants={c.participantVesting} />
            )}
          </section>

          <section className="ct-fig" aria-labelledby="fig4">
            <div className="fig-head">
              <span className="fig-n">4</span>
              <div>
                <h2 id="fig4">Policy and identity</h2>
                <p className="cap">What the creator can still change, and who vouched for the participants.</p>
              </div>
            </div>
            <dl className="facts">
              <div>
                <dt>Policy hash</dt>
                <dd className="mono" title={c.policyHash}>
                  {short(c.policyHash)}
                </dd>
              </div>
              {p && config && (
                <div>
                  <dt>Fee split at launch</dt>
                  <dd>
                    bid {p.bidBps / 100}, stakers {p.stakersBps / 100}, team {p.teamBps / 100}, platform {p.platformBps / 100}
                  </dd>
                </div>
              )}
              <div>
                <dt>Attestor</dt>
                <dd>
                  {verified ? (
                    <a className="mono" href={explorerAddress(c.attestor)} target="_blank" rel="noreferrer">
                      {short(c.attestor)}
                    </a>
                  ) : (
                    "Open round"
                  )}
                </dd>
              </div>
              <div>
                <dt>Evidence accumulator</dt>
                <dd className="mono" title={c.evidenceAccumulator}>
                  {c.evidenceAccumulator === ZERO_HASH ? "none" : short(c.evidenceAccumulator)}
                </dd>
              </div>
            </dl>
            <p className="fine">
              The policy hash covers the creator-fee split at launch
              {config
                ? `, the bounds any later change must stay inside (bid ${config.bounds.min.bidBps / 100} to ${config.bounds.max.bidBps / 100}, stakers ${config.bounds.min.stakersBps / 100} to ${config.bounds.max.stakersBps / 100}, team ${config.bounds.min.teamBps / 100} to ${config.bounds.max.teamBps / 100}), the ${durationAdj(config.bounds.timelock)} timelock every change waits out, ${config.exitEnabled ? "the creator's right to hand Ascend's creator role on after that wait" : "that the creator role can't be handed on"}, and ${config.listingCap > 0n ? `a HyperCore listing set-aside of up to ${usdc(config.listingCap)} USDC` : "that there is no HyperCore listing set-aside"}.`
                : ", its bounds and timelock, the exit switch and the listing set-aside."}{" "}
              {recomputed &&
                (matches
                  ? "Recomputed from the round's on-chain rules just now: it matches."
                  : "Recomputed from the round's on-chain rules just now: it does not match the recorded hash.")}
            </p>
            <p className="fine">
              {verified ? (
                <>
                  The accumulator chains the evidence hash of every voucher the round accepted, in commit order. Each piece of evidence is public at{" "}
                  <span className="mono">{API_URL.replace(/^https?:\/\//, "")}/evidence/&lt;hash&gt;</span>, checked against{" "}
                  <a href={`${API_URL}/rules/v1`} target="_blank" rel="noreferrer">
                    the rules
                  </a>
                  , so anyone can recompute it.
                </>
              ) : (
                "Open rounds take no identity vouchers, so there is no attestor and nothing to accumulate."
              )}
            </p>
          </section>
        </div>

        <footer className="ct-links">
          <Link className="link" href={`/rounds/${c.round}`}>
            The round
          </Link>
          <a className="link" href={explorerAddress(c.token)} target="_blank" rel="noreferrer">
            Token {short(c.token)}
          </a>
          <a className="link" href={explorerAddress(ascendTestnet.poolManager)} target="_blank" rel="noreferrer" title={c.poolId}>
            Pool {short(c.poolId)}
          </a>
          {row?.firedTx && (
            <a className="link" href={explorerTx(row.firedTx)} target="_blank" rel="noreferrer">
              Fire transaction
            </a>
          )}
          {registry && (
            <a className="link" href={explorerAddress(registry)} target="_blank" rel="noreferrer">
              Certificate registry
            </a>
          )}
        </footer>
      </article>
      <p className="cap ct-note">
        Written once, by the round itself, in the transaction that launched the token. Nobody can edit it afterwards. Ascend doesn't read
        certificates yet; that is on the roadmap.
      </p>
    </main>
  );
}

function Meter({ label, bps }: { label: string; bps: number }) {
  return (
    <div className="meter-row">
      <div className="meter-lbl">
        <span>{label}</span>
        <b>{pct(bps)}</b>
      </div>
      <div className="meter" role="img" aria-label={`${label}: ${pct(bps)} of the batch`}>
        <i style={{ width: `${Math.min(100, bps / 100)}%` }} />
      </div>
    </div>
  );
}

function Missing({ token }: { token: string }) {
  return (
    <main className="ct">
      <p className="crumbs">
        <Link href="/rounds">Rounds</Link> / Certificate
      </p>
      <section className="ct-missing">
        <p className="cap">Updraft field guide</p>
        <h1>No certificate for this token</h1>
        <p>
          <span className="mono">{token}</span> has no launch certificate in Updraft's registry on Elysium testnet. Certificates are written
          when a round fires; a round that hasn't fired yet has none.{" "}
          <Link className="link" href="/rounds">
            Browse the rounds
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
