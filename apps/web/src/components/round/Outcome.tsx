"use client";

import Link from "next/link";
import { useState } from "react";
import type { Address, Hash } from "viem";
import { type RoundState, explorerAddress, explorerTx, updraftRoundAbi } from "@updraft/sdk";
import type { RoundRow } from "@/lib/data";
import { publicClient, useWallet } from "@/lib/wallet";
import type { ErrorContext } from "./errors";
import { abortWords, ago, compact, durationAdj, price, same, short, tokenNum, tokens, usdc, vestedAt, vesting, when, whenFull } from "./format";
import type { Batch, Participant, Position, RoundParams, SwapRow, TxState } from "./hooks";
import { TxStatus } from "./TxStatus";
import { VEST_COLORS, VestingChart } from "./VestingChart";

type Run = (label: string, send: () => Promise<Hash>, opts: { ctx?: ErrorContext; done: string | (() => Promise<string>) }) => Promise<boolean>;

/** After a fire or close lands, says what actually happened: fire() can also end in an abort. */
export async function fireOutcome(round: Address): Promise<string> {
  const [status, reason] = await publicClient.multicall({
    allowFailure: false,
    contracts: [
      { address: round, abi: updraftRoundAbi, functionName: "status" },
      { address: round, abi: updraftRoundAbi, functionName: "abortReason" },
    ],
  });
  if (status === 1) return "Fired. The batch is now Ascend's launch buy, and tokens are on their way.";
  if (status === 2) return `The round closed without launching. ${abortWords(Number(reason))} Refunds are open.`;
  return "Sent. The round is still live.";
}

export interface Trade {
  swap: SwapRow;
  tokens: number;
  quote: number;
  paid: number;
  after: number;
}

/** Buys on the round's pool after the fire, oldest first, as tokens received and USDC paid. */
export function tradesAfterFire(swaps: SwapRow[], tokenIs0: boolean, firedAt: number): Trade[] {
  return swaps
    .map((s) => {
      const tokenDelta = BigInt(tokenIs0 ? s.amount0 : s.amount1);
      const quoteDelta = BigInt(tokenIs0 ? s.amount1 : s.amount0);
      const t = tokenNum(tokenDelta);
      const q = -Number(quoteDelta) / 1e6;
      return { swap: s, tokens: t, quote: q, paid: t > 0 ? q / t : 0, after: s.timestamp - firedAt };
    })
    .filter((t) => t.tokens > 0 && t.quote > 0)
    .sort((a, b) => a.swap.timestamp - b.swap.timestamp || a.swap.id.localeCompare(b.swap.id));
}

export function ReadyPanel({ state, phase, position, run, tx, ctx }: { state: RoundState; phase: "ready" | "overdue"; position: Position | undefined; run: Run; tx: TxState | null; ctx: ErrorContext }) {
  const { updraft, address } = useWallet();
  const r = state.config.raise;
  // fire() measures the escrow it actually holds, not what was committed.
  const held = state.preview.usable;
  const under = held < r.minRaise;
  const busy = tx?.phase === "signing" || tx?.phase === "pending";
  const fire = () =>
    run(under ? "Close the round" : "Fire the round", () => updraft.fire(state.address), { ctx, done: () => fireOutcome(state.address) });
  const abort = () => run("Close the round", () => updraft.abort(state.address), { ctx, done: () => fireOutcome(state.address) });
  return (
    <section className="panel" id="p-commit" aria-labelledby="h-ready">
      <h2 id="h-ready">{phase === "ready" ? "It's T0" : "Past the fire-by time"}</h2>
      {phase === "ready" ? (
        <p className="sub">
          {under
            ? `Commits are closed and the round holds ${usdc(held)} USDC, under its minimum of ${usdc(r.minRaise)}. Sending the transaction closes it, and everyone can take a full refund.`
            : `Commits are closed. One transaction turns the pot into Ascend's launch buy. Anyone can send it; it costs only gas. If nobody does by ${when(state.config.windows.fireBy)}, everyone is refunded.`}
        </p>
      ) : (
        <p className="sub">
          Nobody fired the round by {when(state.config.windows.fireBy)}. Anyone can now close it, and every commit becomes refundable.
        </p>
      )}
      {position && position.committed > 0n && (
        <dl className="rows">
          <div>
            <dt>You have in the batch</dt>
            <dd>{usdc(position.committed)} USDC</dd>
          </div>
        </dl>
      )}
      <button type="button" className="go" disabled={!address || busy} onClick={phase === "ready" ? fire : abort}>
        {!address ? "Connect a wallet to send it" : busy ? "Waiting for the wallet…" : phase === "ready" && !under ? "Fire the round" : "Close the round and open refunds"}
      </button>
      <TxStatus tx={tx} />
    </section>
  );
}

export function AbortedPanel({ state, position, run, tx, ctx }: { state: RoundState; position: Position | undefined; run: Run; tx: TxState | null; ctx: ErrorContext }) {
  const { updraft, address } = useWallet();
  const busy = tx?.phase === "signing" || tx?.phase === "pending";
  const owed = position && position.committed > 0n && !position.refunded;
  return (
    <section className="panel" id="p-commit" aria-labelledby="h-refund">
      <h2 id="h-refund">Refunds</h2>
      <p className="sub">{abortWords(state.abortReason)} Every commit is refundable: each wallet takes its pro-rata share of what the round holds.</p>
      {!address ? (
        <p className="fine">Connect the wallet you committed from to take your refund.</p>
      ) : !position ? (
        <p className="fine">Reading your position…</p>
      ) : owed ? (
        <>
          <dl className="rows">
            <div>
              <dt>You committed</dt>
              <dd>{usdc(position.committed)} USDC</dd>
            </div>
          </dl>
          <button
            type="button"
            className="go"
            disabled={busy}
            onClick={() => run("Refund", () => updraft.refundAborted(state.address), { ctx, done: "Refunded. The USDC is back in your wallet." })}
          >
            {busy ? "Waiting for the wallet…" : "Take my refund"}
          </button>
        </>
      ) : position.refunded ? (
        <p className="fine">This wallet has already taken its refund.</p>
      ) : (
        <p className="fine">This wallet had nothing in the round.</p>
      )}
      <TxStatus tx={tx} />
    </section>
  );
}

const PUSH_SLICE = 150;

export function YourTokensPanel({
  state,
  position,
  participants,
  run,
  tx,
  ctx,
  now,
}: {
  state: RoundState;
  position: Position | undefined;
  participants: Participant[];
  run: Run;
  tx: TxState | null;
  ctx: ErrorContext;
  now: number | null;
}) {
  const { updraft, address } = useWallet();
  const f = state.fired!;
  const sym = state.config.symbol;
  const busy = tx?.phase === "signing" || tx?.phase === "pending";
  const creatorIn = participants.some((p) => same(p.wallet, state.config.creator));
  const pushTo = Math.max(0, state.participantCount - (creatorIn ? 1 : 0));
  const pushed = Math.min(f.distributedCount, pushTo);
  // A big round is pushed a slice per transaction, so no single push outgrows a block.
  const [cursor, setCursor] = useState(0);
  const sliceEnd = Math.min(state.participantCount, cursor + PUSH_SLICE);
  const c = position?.committed ?? 0n;
  const share = state.totalCommitted > 0n ? (f.netTokens * c) / state.totalCommitted : 0n;
  const isCreator = same(address, state.config.creator);
  const v = isCreator ? state.config.creatorVesting : state.config.participantVesting;
  const unlocked = now === null ? 0 : vestedAt(v, now - f.firedAt);
  const claimT = position?.claimableTokens ?? 0n;
  const claimQ = position?.claimableRefund ?? 0n;

  return (
    <section className="panel" id="p-commit" aria-labelledby="h-yours">
      <h2 id="h-yours">Your {sym}</h2>
      {!address ? (
        <p className="sub">Connect the wallet you committed from to see your share and claim it.</p>
      ) : !position ? (
        <p className="sub">Reading your position…</p>
      ) : c === 0n ? (
        <p className="sub">This wallet wasn't in the round. Its tokens went to the wallets that committed before T0.</p>
      ) : (
        <>
          <dl className="rows">
            <div>
              <dt>You committed</dt>
              <dd>{usdc(c)} USDC</dd>
            </div>
            <div>
              <dt>Your share</dt>
              <dd>
                {tokens(share)} {sym}
              </dd>
            </div>
            <div>
              <dt>In your wallet from the round</dt>
              <dd>
                {tokens(position.claimedTokens)} {sym}
              </dd>
            </div>
            <div>
              <dt>Claimable now</dt>
              <dd>
                {tokens(claimT)} {sym}
                {claimQ > 0n && <small> and {usdc(claimQ)} USDC</small>}
              </dd>
            </div>
            {position.refundPaid > 0n && (
              <div>
                <dt>Refunded (oversubscription)</dt>
                <dd>{usdc(position.refundPaid)} USDC</dd>
              </div>
            )}
          </dl>
          <p className="fine">
            {isCreator ? "As the creator, your share vests in public: " : "Participant tokens: "}
            {vesting(v)}. {Math.round(unlocked * 100)}% unlocked so far.
          </p>
          <button
            type="button"
            className="go"
            disabled={busy || (claimT === 0n && claimQ === 0n)}
            onClick={() =>
              run("Claim", () => updraft.claim(state.address), {
                ctx,
                done: `Claimed ${tokens(claimT)} ${sym}${claimQ > 0n ? ` and ${usdc(claimQ)} USDC` : ""}.`,
              })
            }
          >
            {busy
              ? "Waiting for the wallet…"
              : claimT === 0n && claimQ === 0n
                ? "Nothing to claim right now"
                : `Claim ${tokens(claimT)} ${sym}${claimQ > 0n ? ` and ${usdc(claimQ)} USDC` : ""}`}
          </button>
        </>
      )}
      <TxStatus tx={tx} />

      <div className="dist">
        <div className="capnote">
          <span>
            Tokens pushed to {pushed} of {pushTo} wallet{pushTo === 1 ? "" : "s"}
          </span>
          <span>{pushTo ? Math.round((pushed / pushTo) * 100) : 100}%</span>
        </div>
        <div className="capbar" aria-hidden="true">
          <i style={{ width: `${pushTo ? (pushed / pushTo) * 100 : 100}%` }} />
        </div>
        {pushed < pushTo && address && (
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={async () => {
              const ok = await run("Push tokens", () => updraft.distribute(state.address, BigInt(cursor), BigInt(sliceEnd)), {
                ctx,
                done:
                  sliceEnd < state.participantCount
                    ? `Pushed wallets ${cursor + 1} to ${sliceEnd}. Send the next slice for the rest.`
                    : "Pushed. Every unlocked share is on its way to its wallet.",
              });
              if (ok) setCursor(sliceEnd < state.participantCount ? sliceEnd : 0);
            }}
          >
            {state.participantCount > PUSH_SLICE ? `Push wallets ${cursor + 1} to ${sliceEnd}` : "Push the rest now"}
          </button>
        )}
        <p className="fine">Unlocked tokens and any oversubscription refund are pushed to every wallet; the creator claims their own.</p>
      </div>
    </section>
  );
}

export function CreatorPanel({ state, participants, now }: { state: RoundState; participants: Participant[]; now: number | null }) {
  const f = state.fired!;
  const sym = state.config.symbol;
  const cv = state.config.creatorVesting;
  const pv = state.config.participantVesting;
  const creator = participants.find((p) => same(p.wallet, state.config.creator));
  const c = creator ? BigInt(creator.committed) : 0n;
  const share = state.totalCommitted > 0n ? (f.netTokens * c) / state.totalCommitted : 0n;
  const instant = (v: typeof cv) => v.tgeBps >= 10_000 || (v.cliff === 0 && v.duration === 0);
  const unlocked = now === null ? 0 : vestedAt(cv, now - f.firedAt);
  return (
    <section className="panel" id="p-creator" aria-labelledby="h-creator">
      <h2 id="h-creator">The creator's share</h2>
      {c === 0n ? (
        <p className="sub">The creator didn't commit to this round, so there is no creator share to vest. Had they, it would vest on this schedule: {vesting(cv)}.</p>
      ) : (
        <p className="sub">
          The creator committed {usdc(c)} USDC like everyone else and holds {tokens(share)} {sym} at the same price. It vests in public: {vesting(cv)}.{" "}
          <b>{Math.round(unlocked * 100)}% unlocked</b> so far.
        </p>
      )}
      {!(instant(cv) && instant(pv)) && (
        <VestingChart
          start={f.firedAt}
          now={now}
          schedules={[
            { label: "The creator", v: cv, color: VEST_COLORS.creator },
            { label: "Participants", v: pv, color: VEST_COLORS.participants, dash: true },
          ]}
        />
      )}
      {cv.cliff > 0 && (
        <p className="fine">
          The creator's {durationAdj(cv.cliff)} cliff {now !== null && now - f.firedAt >= cv.cliff ? "ended" : "ends"} {when(f.firedAt + cv.cliff)}.
        </p>
      )}
    </section>
  );
}

export function FiredFacts({
  state,
  row,
  batch,
  params,
  trades,
  now,
}: {
  state: RoundState;
  row: RoundRow | null | undefined;
  batch: Batch | undefined;
  params: RoundParams | undefined;
  trades: Trade[];
  now: number | null;
}) {
  const f = state.fired!;
  const sym = state.config.symbol;
  const avg = batch?.avg ?? 0;
  const first = trades.slice(0, 3);
  const lead = first[0];
  return (
    <section className="panel" id="p-after" aria-labelledby="h-after">
      <div className="panel-head">
        <div>
          <h2 id="h-after">After the fire</h2>
          <p className="sub">
            Fired {whenFull(f.firedAt)} in one transaction{row?.firedTx ? "" : "."}
            {row?.firedTx && (
              <>
                {" "}
                (
                <a href={explorerTx(row.firedTx)} target="_blank" rel="noreferrer">
                  view it
                </a>
                ).
              </>
            )}{" "}
            Every wallet in the batch paid {price(avg)} a token.
          </p>
        </div>
        <Link className="chip cert-chip" href={`/certificate/${f.token}`}>
          Read the certificate
        </Link>
      </div>
      <dl className="facts two">
        <div>
          <dt>Token</dt>
          <dd>
            <a className="mono" href={explorerAddress(f.token)} target="_blank" rel="noreferrer">
              {short(f.token)}
            </a>
          </dd>
        </div>
        <div>
          <dt>Pool</dt>
          <dd className="mono" title={f.poolId}>
            {short(f.poolId)}
          </dd>
        </div>
        <div>
          <dt>Fee vault</dt>
          <dd>
            <a className="mono" href={explorerAddress(f.vault)} target="_blank" rel="noreferrer">
              {short(f.vault)}
            </a>
          </dd>
        </div>
        <div>
          <dt>USDC used</dt>
          <dd>{usdc(f.quoteUsed)}</dd>
        </div>
        <div>
          <dt>Tokens bought</dt>
          <dd>
            {tokens(f.tokensOut)} {sym}
          </dd>
        </div>
        <div>
          <dt>To $DRAFT stakers{params ? ` (${params.platformTokenBps / 100}%)` : ""}</dt>
          <dd>
            {tokens(f.tokensOut - f.netTokens)} {sym}
          </dd>
        </div>
        <div>
          <dt>To the round</dt>
          <dd>
            {tokens(f.netTokens)} {sym}
          </dd>
        </div>
        <div>
          <dt>Everyone's price</dt>
          <dd>{price(avg)}</dd>
        </div>
        <div>
          <dt>Refunded (oversubscribed)</dt>
          <dd>{f.refundPool > 0n ? `${usdc(f.refundPool)} USDC` : "none"}</dd>
        </div>
        <div>
          <dt>Shortfall</dt>
          <dd>{row?.shortfall && BigInt(row.shortfall) > 0n ? `${usdc(row.shortfall)} USDC` : "none"}</dd>
        </div>
      </dl>

      <h3 className="h-sub">The first trades after the fire</h3>
      {lead ? (
        <>
          <p className="sub">
            {lead.after <= 0 ? "In the same block" : `${lead.after} s after the fire`}, <span className="mono">{short(lead.swap.trader)}</span> bought{" "}
            {usdc(BigInt(Math.round(lead.quote * 1e6)))} USDC of {sym} and paid {price(lead.paid)} a token, Ascend's launch fee included:{" "}
            <b>{(lead.paid / avg).toFixed(2)}× everyone's price</b>, so {(lead.paid / avg).toFixed(2)}× fewer tokens per USDC than the batch.
          </p>
          <TradeBars avg={avg} trades={first} sym={sym} />
          <ul className="trades">
            {first.map((t) => (
              <li key={t.swap.id}>
                <span>
                  <a className="mono" href={explorerTx(t.swap.tx)} target="_blank" rel="noreferrer">
                    {short(t.swap.trader)}
                  </a>
                  <small>{t.after <= 0 ? "same block as the fire" : `${t.after} s after the fire`}</small>
                </span>
                <span>
                  {usdc(BigInt(Math.round(t.quote * 1e6)))} USDC for {compact(t.tokens)} {sym}
                  <small>
                    {price(t.paid)} a token, {(t.paid / avg).toFixed(2)}×
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="sub">
          No trades on the pool yet{now !== null ? ` (it fired ${ago(f.firedAt, now)})` : ""}. When they come, they show here with the price each
          one paid against the batch.
        </p>
      )}
    </section>
  );
}

/** Tokens per 100 USDC: the batch against each early trade. One measure, so plain bars on one axis. */
function TradeBars({ avg, trades, sym }: { avg: number; trades: Trade[]; sym: string }) {
  const rows = [{ label: "Everyone in the batch", per: 100 / avg, batch: true }, ...trades.map((t, i) => ({ label: i === 0 ? "First buyer after the fire" : `Buyer ${i + 1} after the fire`, per: 100 / t.paid, batch: false }))];
  const top = Math.max(...rows.map((r) => r.per));
  return (
    <figure className="tbars">
      <figcaption className="cap">
        {sym} per 100 USDC: what the same money bought in the batch and just after it.
      </figcaption>
      <dl>
        {rows.map((r) => (
          <div key={r.label} className={r.batch ? "b" : undefined}>
            <dt>{r.label}</dt>
            <dd>
              <span className="tbar" style={{ width: `${(r.per / top) * 100}%` }} aria-hidden="true" />
              <b>{compact(r.per)}</b>
            </dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}
