"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Address } from "viem";
import { type Attestation, type RoundState, Status, ascendTestnet, explorerAddress, explorerTx } from "@updraft/sdk";
import type { RoundRow } from "@/lib/data";
import { useWallet } from "@/lib/wallet";
import { type CommitMode, CommitPanel, commitCheck, parseAmount } from "./CommitPanel";
import { CurveChart, type TradeMark } from "./CurveChart";
import type { ErrorContext } from "./errors";
import { type FlockBird, FlockBand } from "./FlockBand";
import {
  PHASE_LABEL,
  type Phase,
  ZERO_HASH,
  abortWords,
  ago,
  compact,
  countdown,
  isRehearsal,
  phaseOf,
  price,
  same,
  short,
  soon,
  usdc,
  usdcNum,
  vesting,
  when,
} from "./format";
import {
  type Batch,
  type RoundParams,
  type TxState,
  niceSpan,
  tokenIs0,
  useBatch,
  useCurve,
  useDebounced,
  useIndexed,
  useNow,
  useParticipants,
  usePosition,
  useRoundState,
  useTx,
} from "./hooks";
import { IdentityPanel } from "./IdentityPanel";
import { AbortedPanel, CreatorPanel, FiredFacts, ReadyPanel, YourTokensPanel, fireOutcome, tradesAfterFire } from "./Outcome";
import { CertPreview, FieldLog, NextSteps, Rules } from "./Sections";
import { Timeline } from "./Timeline";

type Voucher = Extract<Attestation, { ok: true }>;

export function RoundPage({ address }: { address: Address }) {
  const { known, state } = useRoundState(address);

  if (known.isError || state.isError) {
    return (
      <Shell>
        <Plate title="Elysium didn't answer">
          The round couldn't be read from Elysium testnet just now. This page retries on its own every few seconds.{" "}
          <button type="button" className="link" onClick={() => (known.isError ? known.refetch() : state.refetch())}>
            Try again now
          </button>
        </Plate>
      </Shell>
    );
  }
  if (known.data === null) return <RoundNotFound address={address} />;
  if (!state.data) {
    return (
      <Shell>
        <Plate title="Reading the round" busy>
          Fetching its rules, its commits and Ascend's curve from Elysium testnet.
        </Plate>
      </Shell>
    );
  }
  return <Round address={address} />;
}

function Round({ address }: { address: Address }) {
  const { address: wallet, updraft } = useWallet();
  const now = useNow();
  const { state, params, number } = useRoundState(address);
  const s = state.data as RoundState;
  const fired = s.status === Status.Fired;
  const idx = useIndexed(address, fired);
  const position = usePosition(s, wallet);
  const [mode, setMode] = useState<CommitMode>("commit");
  const [text, setText] = useState("");
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const { tx, run } = useTx();

  useEffect(() => setVoucher(null), [wallet]);

  // the right column sticks to the top while it fits the window, else to the bottom, so none of it is out of reach
  const rightRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rightRef.current;
    if (!el) return;
    const place = () => el.style.setProperty("--stick", `${Math.min(20, window.innerHeight - el.offsetHeight - 20)}px`);
    const ro = new ResizeObserver(place);
    ro.observe(el);
    window.addEventListener("resize", place);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
    };
  }, []);

  const cfg = s.config;
  const phase: Phase = phaseOf(s.status, cfg.windows, now ?? Math.floor(Date.now() / 1000));
  // Amounts on this page are formatted as 6-decimal USDC; other quotes get a notice instead of a form.
  const usdcRound = cfg.quote.toLowerCase() === ascendTestnet.usdc.toLowerCase();
  useEffect(() => {
    if (phase !== "open" && mode === "withdraw") setMode("commit");
  }, [phase, mode]);

  const amount = parseAmount(text);
  const live = phase === "open" || phase === "locked";
  const problem = commitCheck({ mode, amount, state: s, position: position.data, wallet });
  const rawExtra = live && !problem && amount ? (mode === "commit" ? amount : -amount) : 0n;
  const extra = useDebounced(rawExtra, 320);
  const batch = useBatch(s, params.data, extra);
  const b = batch.data;
  const spanUsd = niceSpan(Math.max((b?.devBuy ?? 0) * 2, usdcNum(cfg.raise.minRaise) * 1.5, 50));
  const curve = useCurve(s, spanUsd);

  const ctx: ErrorContext = {
    minCommit: cfg.raise.minCommit,
    walletCap: cfg.raise.walletCap,
    creatorCap: cfg.raise.creatorCap,
    openAt: cfg.windows.openAt,
    lockAt: cfg.windows.lockAt,
    closeAt: cfg.windows.closeAt,
  };

  const participants = useParticipants(s, idx.participants, idx.round.isFetched);
  const birds: FlockBird[] = useMemo(
    () =>
      participants.map((p) => ({
        wallet: p.wallet,
        amount: BigInt(p.committed),
        you: same(p.wallet, wallet),
        dev: same(p.wallet, cfg.creator),
        verified: !!p.identityId && p.identityId !== ZERO_HASH,
      })),
    [participants, wallet, cfg.creator],
  );

  const trades = fired && s.fired ? tradesAfterFire(idx.swaps.data ?? [], tokenIs0(s), s.fired.firedAt) : [];
  const marks: TradeMark[] = [];
  if (b && trades.length) {
    let cum = b.tokensOut;
    for (const t of trades.slice(0, 3)) {
      marks.push({ at: cum + t.tokens / 2, paid: t.paid, label: marks.length ? `Trade ${marks.length + 1} after the fire` : "First trade after the fire" });
      cum += t.tokens;
    }
  }

  const rehearsal = isRehearsal(cfg.creator);
  const row = idx.round.data as RoundRow | null | undefined;
  const youIn = !!position.data && position.data.committed + (mode === "commit" ? rawExtra : 0n) > 0n;

  const n = participants.length;
  const caption =
    phase === "fired" ? (
      <>
        <b>
          {n} bird{n === 1 ? "" : "s"}
        </b>{" "}
        landed together at T0, on one wire.
      </>
    ) : phase === "aborted" ? (
      <>The round was aborted. Nobody landed; every commit is refundable.</>
    ) : n === 0 ? (
      <>No birds in the air yet. The first commit starts the flock.</>
    ) : (
      <>
        <b>
          {n} bird{n === 1 ? "" : "s"}
        </b>{" "}
        in the air. They land together at T0, on one wire.
      </>
    );

  const fireAction = () =>
    phase === "ready"
      ? run(s.totalCommitted < cfg.raise.minRaise ? "Close the round" : "Fire the round", () => updraft.fire(address), {
          ctx,
          done: () => fireOutcome(address),
        })
      : run("Close the round", () => updraft.abort(address), { ctx, done: () => fireOutcome(address) });

  return (
    <Shell>
      <p className="crumbs">
        <Link href="/rounds">Rounds</Link> / {cfg.name}
      </p>

      <section className="head" aria-labelledby="round-title">
        <div>
          <div className="title">
            <h1 id="round-title" className={cfg.name.length > 16 ? "long" : undefined}>
              {cfg.name}
            </h1>
            <span className="sym">${cfg.symbol}</span>
          </div>
          <p className="cap bin">
            {number.data ? `Round ${number.data}` : "A round"}
            {rehearsal ? ", a rehearsal by the Updraft team," : ","} {fired ? "launched" : "launching"} on Ascend.
          </p>
          <div className="chips">
            <span className={`chip st ${phase}`}>
              <i />
              {PHASE_LABEL[phase]}
            </span>
            <span className="chip">{cfg.mode === 1 ? "Verified round" : "Open round"}</span>
            {phase === "open" && <span className="chip">Withdrawals open until the lock</span>}
            {rehearsal && <span className="chip ex">Rehearsal</span>}
          </div>
          <p className="creator">
            Created by{" "}
            <a className="mono" href={explorerAddress(cfg.creator)} target="_blank" rel="noreferrer">
              {short(cfg.creator)}
            </a>
            .{" "}
            {cfg.raise.creatorCap === 0n ? (
              "The creator can't commit to this round."
            ) : (
              <>
                The creator commits like everyone else, can put in at most {usdc(cfg.raise.creatorCap)} USDC, and vests in public:{" "}
                {vesting(cfg.creatorVesting)}.
              </>
            )}{" "}
            Token address, {fired ? "as promised before launch" : "known before launch"}:{" "}
            <a className="mono" href={explorerAddress(s.expectedToken)} target="_blank" rel="noreferrer">
              {short(s.expectedToken)}
            </a>
            .
          </p>
        </div>
        <Clock s={s} phase={phase} now={now} row={row} tx={tx} onFire={fireAction} canSend={!!wallet} />
      </section>

      <FlockBand birds={birds} landed={phase === "fired"} caption={caption} />

      <div className="main">
        <div className="left">
          <section className="panel" id="p-chart" aria-labelledby="h-curve">
            <div className="panel-head">
              <div>
                <h2 id="h-curve">
                  {phase === "fired" ? "Where the batch landed on Ascend's curve" : phase === "aborted" ? "Where the batch would have landed" : "Where this batch lands on Ascend's curve"}
                </h2>
                <p className="sub">{curveSub(phase, b, extra, cfg.symbol)}</p>
              </div>
            </div>
            {curve.data && curve.data.length > 1 ? (
              <CurveChart
                curve={curve.data}
                batch={b}
                symbol={cfg.symbol}
                fired={phase === "fired"}
                trades={marks}
                updating={batch.isFetching || curve.isFetching || extra !== rawExtra}
                youOnWire={youIn}
              />
            ) : (
              <div className="chart-empty cap">{curve.isError ? "Ascend's curve couldn't be read through the lens just now." : "Sampling Ascend's curve…"}</div>
            )}
            <div className="chart-foot">
              <p className="cap">
                Ascend's real launch curve for this launchpad and quote, sampled through Updraft's lens contract
                {phase === "fired" ? " as it is configured today." : ". Type an amount on the right to see the batch move."}
              </p>
            </div>
            {b && <Numbers b={b} params={params.data} symbol={cfg.symbol} />}
          </section>

          {phase === "fired" && <FiredFacts state={s} row={row} batch={b} params={params.data} trades={trades} now={now} />}

          <div className="duo" id="p-duo">
            <FieldLog commits={idx.commits.data ?? []} participants={participants} state={s} wallet={wallet} now={now} />
            <Rules state={s} />
          </div>

          <CertPreview state={s} batch={b} participants={participants} number={number.data} wallet={wallet} />
        </div>

        <div className="right" ref={rightRef}>
          {(phase === "upcoming" || phase === "open" || phase === "locked") && !usdcRound && (
            <section className="panel" aria-labelledby="h-quote">
              <h2 id="h-quote">Your commit</h2>
              <p className="fine">
                This round raises in a token other than USDC. The app only handles USDC rounds so far, so commit through the SDK or
                the contract directly: <a className="link" href={explorerAddress(s.address)} target="_blank" rel="noreferrer">the round on the explorer</a>.
              </p>
            </section>
          )}
          {(phase === "upcoming" || phase === "open" || phase === "locked") && usdcRound && (
            <>
              <CommitPanel
                state={s}
                params={params.data}
                phase={phase}
                position={position.data}
                batch={b}
                mode={mode}
                setMode={setMode}
                text={text}
                setText={setText}
                voucher={voucher}
                tx={tx}
                run={run}
                ctx={ctx}
              />
              <IdentityPanel state={s} position={position.data} voucher={voucher} setVoucher={setVoucher} />
              <NextSteps state={s} phase={phase} />
            </>
          )}
          {(phase === "ready" || phase === "overdue") && <ReadyPanel state={s} phase={phase} position={position.data} run={run} tx={tx} ctx={ctx} />}
          {phase === "fired" && (
            <>
              <YourTokensPanel state={s} position={position.data} participants={participants} run={run} tx={tx} ctx={ctx} now={now} />
              <CreatorPanel state={s} participants={participants} now={now} />
            </>
          )}
          {phase === "aborted" && <AbortedPanel state={s} position={position.data} run={run} tx={tx} ctx={ctx} />}
        </div>
      </div>
    </Shell>
  );
}

function curveSub(phase: Phase, b: Batch | undefined, extra: bigint, sym: string) {
  if (!b) return "Reading the batch…";
  if (b.tokensOut <= 0) return "No commits yet, so there is no batch on the curve. The first commit puts one there.";
  const buys = `${usdc(BigInt(Math.round(b.effective * 1e6)))} USDC`;
  if (phase === "fired") return `At T0, ${buys} bought ${compact(b.tokensOut)} ${sym} in one transaction, at one average price.`;
  if (phase === "aborted") return `The round aborted before it fired. ${buys} would have bought ${compact(b.tokensOut)} ${sym} at one average price.`;
  const what = `${buys} would buy ${compact(b.tokensOut)} ${sym} in one transaction, at one average price.`;
  if (extra > 0n) return `With your ${usdc(extra)} USDC added, ${what}`;
  if (extra < 0n) return `After your withdrawal, ${what}`;
  return `If the round fired now, ${what}`;
}

function Numbers({ b, params, symbol }: { b: Batch; params: RoundParams | undefined; symbol: string }) {
  const parity = b.effective - b.devBuy;
  const rows: [string, string][] = [
    ["Into the launch buy", `${usdc(BigInt(Math.round(b.effective * 1e6)))} USDC`],
    [`To Ascend's bid${params ? ` (${params.parityBps / 100}%)` : ""}`, `${parity.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC`],
    ["Spent on the curve", `${usdc(BigInt(Math.round(b.devBuy * 1e6)))} USDC`],
    ["Tokens bought", `${compact(b.tokensOut)} ${symbol}`],
    [`To $DRAFT stakers${params ? ` (${params.platformTokenBps / 100}%)` : ""}`, `${compact(b.tokensOut - b.netTokens)} ${symbol}`],
    ["To the round", `${compact(b.netTokens)} ${symbol}`],
    ["Everyone's price", price(b.avg)],
    ["Next buyer's curve price", price(b.next)],
  ];
  if (b.oversubscribed > 0) rows.push(["Over the max raise, refunded pro-rata", `${b.oversubscribed.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC`]);
  return (
    <details className="nums">
      <summary>The numbers behind the chart</summary>
      <table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function Clock({
  s,
  phase,
  now,
  row,
  tx,
  onFire,
  canSend,
}: {
  s: RoundState;
  phase: Phase;
  now: number | null;
  row: RoundRow | null | undefined;
  tx: TxState | null;
  onFire: () => void;
  canSend: boolean;
}) {
  const w = s.config.windows;
  const t = now ?? w.openAt;
  const busy = tx?.phase === "signing" || tx?.phase === "pending";
  let left: [string, string];
  let right: [string, string] | null;
  switch (phase) {
    case "upcoming":
      left = ["Commits open in", countdown(w.openAt - t)];
      right = ["T0 in", countdown(w.closeAt - t)];
      break;
    case "open":
      left = ["Withdrawals lock in", countdown(w.lockAt - t)];
      right = ["T0 in", countdown(w.closeAt - t)];
      break;
    case "locked":
      left = ["T0 in", countdown(w.closeAt - t)];
      right = ["Withdrawals", "locked"];
      break;
    case "ready":
      left = ["Fire by", countdown(w.fireBy - t)];
      right = ["T0", "passed"];
      break;
    case "overdue":
      left = ["Fire-by passed", ago(w.fireBy, t)];
      right = null;
      break;
    case "fired":
      left = ["Fired", ago(s.fired!.firedAt, t)];
      right = ["after T0", s.fired!.firedAt - w.closeAt < 120 ? `${Math.max(0, s.fired!.firedAt - w.closeAt)} s` : soon(s.fired!.firedAt - w.closeAt)];
      break;
    default:
      left = ["Aborted", "Refunds open"];
      right = null;
  }
  return (
    <aside className="clock" aria-label="Round timing">
      <div className="clock-row">
        <div>
          <div className="lbl">{left[0]}</div>
          <div className="big" aria-live="off">
            {now === null ? "…" : left[1]}
          </div>
        </div>
        {right && (
          <div>
            <div className="lbl r">{right[0]}</div>
            <div className="small">{now === null ? "…" : right[1]}</div>
          </div>
        )}
      </div>
      {now !== null && <Timeline w={w} now={now} firedAt={s.fired?.firedAt ?? null} />}
      <div className="fire-row">
        {phase === "fired" ? (
          <>
            <p>
              One transaction turned the pot into Ascend's launch buy.{" "}
              {row?.firedTx && (
                <a href={explorerTx(row.firedTx)} target="_blank" rel="noreferrer">
                  View it
                </a>
              )}
            </p>
          </>
        ) : phase === "aborted" ? (
          <p>{abortWords(s.abortReason)}</p>
        ) : phase === "ready" || phase === "overdue" ? (
          <>
            <p>
              {phase === "ready"
                ? "It's T0. Anyone can send the fire transaction; it costs only gas."
                : "Nobody fired in time. Anyone can close the round and open refunds."}
            </p>
            <button type="button" className="btn-fire" disabled={!canSend || busy} onClick={onFire} title={canSend ? undefined : "Connect a wallet first"}>
              {phase === "ready" ? (s.totalCommitted < s.config.raise.minRaise ? "Close round" : "Fire round") : "Close round"}
            </button>
          </>
        ) : (
          <>
            <p>At T0 ({when(w.closeAt)}) anyone can send the fire transaction. If nobody does by the fire-by time, everyone is refunded.</p>
            <button type="button" className="btn-ghost" disabled title="Opens at T0">
              Fire round
            </button>
          </>
        )}
      </div>
    </aside>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="rp">{children}</main>;
}

function Plate({ title, children, busy }: { title: string; children: React.ReactNode; busy?: boolean }) {
  return (
    <section className={`plate-msg${busy ? " busy" : ""}`} aria-busy={busy || undefined}>
      <p className="cap">Updraft field guide</p>
      <h1>{title}</h1>
      <p>{children}</p>
    </section>
  );
}

export function RoundNotFound({ address }: { address: string }) {
  return (
    <Shell>
      <p className="crumbs">
        <Link href="/rounds">Rounds</Link> / not found
      </p>
      <Plate title="No round at this address">
        <span className="mono">{address}</span> isn't a round created by Updraft's factory on Elysium testnet. Check the address, or{" "}
        <Link className="link" href="/rounds">
          browse the rounds
        </Link>
        .
      </Plate>
    </Shell>
  );
}
