"use client";

import Link from "next/link";
import { useState } from "react";
import { type RoundState, explorerAddress, explorerTx } from "@updraft/sdk";
import type { CommitRow } from "@/lib/data";
import { FOREST, INK, PerchPath, WING, WireArt } from "./birds";
import { type Phase, ZERO_HASH, ago, duration, durationAdj, price, same, short, tokens, usdc, vesting, when } from "./format";
import type { Batch, Participant } from "./hooks";

const verb: Record<CommitRow["kind"], string> = { commit: "committed", withdraw: "withdrew", refund: "refunded", claim: "received" };

function Glyph({ amount, top, color }: { amount: number; top: number; color: string }) {
  const w = 9 + Math.sqrt(Math.min(1, amount / Math.max(top, 1))) * 6;
  const k = w / 12;
  const h = 16 * k;
  return (
    <svg viewBox="0 0 28 22" aria-hidden="true">
      <g
        transform={`translate(${(14 - w / 2).toFixed(1)} ${(21 - h).toFixed(1)}) scale(${k})`}
        fill={color}
        color={color}
        stroke={color === WING ? FOREST : undefined}
        strokeWidth={color === WING ? 0.6 / k : undefined}
      >
        <PerchPath />
      </g>
      <line x1="2" y1="21" x2="26" y2="21" stroke={INK} strokeWidth="1" />
    </svg>
  );
}

export function FieldLog({
  commits,
  participants,
  state,
  wallet,
  now,
}: {
  commits: CommitRow[];
  participants: Participant[];
  state: RoundState;
  wallet: string | null;
  now: number | null;
}) {
  const [all, setAll] = useState(false);
  const amounts = participants.map((p) => Number(p.committed) / 1e6).sort((a, b) => a - b);
  const median = amounts.length ? amounts[Math.floor(amounts.length / 2)] : 0;
  const top = amounts.length ? amounts[amounts.length - 1] : 1;
  const shown = all ? commits : commits.slice(0, 12);
  const sym = state.config.symbol;
  return (
    <section className="panel" aria-labelledby="h-log">
      <h2 id="h-log">Field log</h2>
      <div className="stats">
        <div>
          <b>{participants.length}</b>committer{participants.length === 1 ? "" : "s"}
        </div>
        <div>
          <b>{usdc(state.totalCommitted)}</b>USDC committed
        </div>
        <div>
          <b>{usdc(BigInt(Math.round(median * 1e6)))}</b>median USDC
        </div>
      </div>
      {commits.length === 0 ? (
        <p className="empty cap">
          {state.participantCount > 0
            ? "The commits are on chain; this log fills in as Updraft's indexer catches up."
            : "No commits yet. The first one starts the flock."}
        </p>
      ) : (
        <ul className={`feed${all ? " all" : ""}`} aria-label="Commits, newest first">
          {shown.map((c) => {
            const you = same(c.wallet, wallet);
            const dev = same(c.wallet, state.config.creator);
            const usd = Number(c.amount) / 1e6;
            const color = you ? WING : dev ? FOREST : INK;
            return (
              <li key={c.id} className={`${c.kind === "withdraw" ? "wd" : ""}${you ? " me" : ""}`}>
                <Glyph amount={c.kind === "claim" ? top / 2 : usd} top={top} color={color} />
                <div className="who">
                  {you ? "You" : dev ? "The creator" : <span className="mono">{short(c.wallet)}</span>}
                  <small>
                    <a href={explorerTx(c.tx)} target="_blank" rel="noreferrer">
                      {verb[c.kind]}
                    </a>
                    , {now === null ? when(c.timestamp) : ago(c.timestamp, now)}
                  </small>
                </div>
                <div className="amt">
                  {c.kind === "claim" ? `${tokens(c.tokens)} ${sym}` : `${usdc(c.amount)} USDC`}
                  <small>{c.kind === "commit" ? (c.identityId && c.identityId !== ZERO_HASH ? "verified" : "open round") : ""}</small>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {commits.length > 12 && (
        <button type="button" className="more" onClick={() => setAll((a) => !a)} aria-expanded={all}>
          {all ? "Show the latest 12" : `Show all ${commits.length} entries`}
        </button>
      )}
    </section>
  );
}

export function Rules({ state }: { state: RoundState }) {
  const c = state.config;
  const r = c.raise;
  const p = c.policy;
  const b = c.bounds;
  const bp = (n: number) => `${n / 100}%`;
  const range = (k: keyof typeof p) => `${b.min[k] / 100} to ${b.max[k] / 100}`;
  return (
    <section className="panel" aria-labelledby="h-rules">
      <h2 id="h-rules">Rules of this round</h2>
      <p className="sub">Fixed when the round was created. Nobody can change them now, the creator included.</p>
      <dl className="rules">
        <div>
          <dt>Mode</dt>
          <dd>{c.mode === 1 ? "Verified: one place per Hyperliquid account" : "Open: any wallet can commit"}</dd>
        </div>
        <div>
          <dt>Caps</dt>
          <dd>
            {usdc(r.walletCap)} USDC per {c.mode === 1 ? "verified account" : "wallet"}; the creator up to {usdc(r.creatorCap)}
          </dd>
        </div>
        <div>
          <dt>Smallest commit</dt>
          <dd>{usdc(r.minCommit)} USDC</dd>
        </div>
        <div>
          <dt>Raise</dt>
          <dd>
            At least {usdc(r.minRaise)}, at most {usdc(r.maxRaise)} USDC into the launch buy. Anything over is refunded pro-rata
          </dd>
        </div>
        <div>
          <dt>Lock</dt>
          <dd>{when(c.windows.lockAt)}. Withdrawals stop</dd>
        </div>
        <div>
          <dt>T0</dt>
          <dd>{when(c.windows.closeAt)}. Commits close and the round can fire</dd>
        </div>
        <div>
          <dt>Fire by</dt>
          <dd>{when(c.windows.fireBy)}, or everyone is refunded</dd>
        </div>
        <div>
          <dt>The creator</dt>
          <dd>Pays the same price; vests {vesting(c.creatorVesting)}</dd>
        </div>
        <div>
          <dt>Participants</dt>
          <dd>{vesting(c.participantVesting).replace(/^./, (s) => s.toUpperCase())}</dd>
        </div>
        <div>
          <dt>Fee policy</dt>
          <dd>
            Ascend's bid {bp(p.bidBps)} ({range("bidBps")}), stakers {bp(p.stakersBps)} ({range("stakersBps")}), team {bp(p.teamBps)} (
            {range("teamBps")}), platform {bp(p.platformBps)}. Changes wait {duration(b.timelock)}
          </dd>
        </div>
        <div>
          <dt>Exit</dt>
          <dd>
            {c.exitEnabled
              ? `The creator may hand Ascend's creator role to another address, after a public ${duration(b.timelock)} wait`
              : "Ascend's creator role stays with the fee vault"}
          </dd>
        </div>
        <div>
          <dt>Listing</dt>
          <dd>
            {c.listingCap > 0n
              ? `Up to ${usdc(c.listingCap)} USDC of quote fees set aside toward a HyperCore spot listing`
              : "No set-aside for a HyperCore listing"}
          </dd>
        </div>
        <div>
          <dt>Refunds</dt>
          <dd>
            If the minimum isn't reached, the fire-by time passes, Ascend's curve or quote changes, or the launchpad is retired. While
            Ascend is paused, or a launch attempt fails, the round waits
          </dd>
        </div>
        <div>
          <dt>Contract</dt>
          <dd>
            <a className="mono" href={explorerAddress(state.address)} target="_blank" rel="noreferrer">
              {short(state.address)}
            </a>
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function NextSteps({ state, phase }: { state: RoundState; phase: Phase }) {
  const w = state.config.windows;
  const sym = state.config.symbol;
  return (
    <section className="panel" id="p-t0" aria-labelledby="h-t0">
      <h2 id="h-t0">What happens next</h2>
      <ol className="next">
        {phase === "upcoming" && (
          <li>
            <b>Open</b>
            <span>{when(w.openAt)}. Commits open.</span>
          </li>
        )}
        <li>
          <b>Lock</b>
          <span>{when(w.lockAt)}. Withdrawals stop; your commit is final.</span>
        </li>
        <li>
          <b>Fire</b>
          <span>{when(w.closeAt)}. One transaction turns the pot into Ascend's launch buy. Anyone can send it.</span>
        </li>
        <li>
          <b>Land</b>
          <span>
            Your {sym} is pushed to your wallet ({vesting(state.config.participantVesting)}). The creator's share starts vesting:{" "}
            {vesting(state.config.creatorVesting)}.
          </span>
        </li>
      </ol>
      <p className="fine">
        If the round isn't fired by {when(w.fireBy)}, or the minimum of {usdc(state.config.raise.minRaise)} USDC isn't reached, every commit
        is refunded in full.
      </p>
    </section>
  );
}

export function CertPreview({
  state,
  batch,
  participants,
  number,
  wallet,
}: {
  state: RoundState;
  batch: Batch | undefined;
  participants: Participant[];
  number: number | null | undefined;
  wallet: string | null;
}) {
  const c = state.config;
  const fired = !!state.fired;
  const total = Number(state.totalCommitted) / 1e6;
  const amounts = participants.map((p) => Number(p.committed) / 1e6).sort((a, b) => b - a);
  const top1 = total ? (amounts[0] ?? 0) / total : 0;
  const top10 = total ? amounts.slice(0, 10).reduce((s, a) => s + a, 0) / total : 0;
  const creator = participants.find((p) => same(p.wallet, c.creator));
  const devShare = creator && total ? Number(creator.committed) / 1e6 / total : 0;
  const order = [...participants].sort((a, b) => Number(BigInt(b.committed) - BigInt(a.committed)));
  const shown = Math.min(order.length, 40);
  const you = order.slice(0, shown).findIndex((p) => same(p.wallet, wallet));
  const dev = order.slice(0, shown).findIndex((p) => same(p.wallet, c.creator));
  const p = c.policy;
  return (
    <section className="cert" id="p-cert" aria-labelledby="h-cert">
      <div className="panel-head">
        <p className="cap">
          Updraft launch certificate{number ? (
            <>
              , <b className="num">Plate No. {String(number).padStart(4, "0")}</b>
            </>
          ) : null}
        </p>
        <span className="chip ex">{fired ? "Written on-chain at T0" : "Preview: written on-chain at T0"}</span>
      </div>
      <div className="cert-grid">
        <div>
          <h3 id="h-cert">
            {c.name}
            <small>${c.symbol}</small>
          </h3>
          <p className="cap">{fired ? "fired at T0 in one transaction" : "if it fired now"}</p>
          <div className="cert-art">
            <WireArt birds={shown} you={you} dev={dev} height={you >= 0 || dev >= 0 ? 120 : 84} />
          </div>
        </div>
        <div>
          <dl className="facts">
            <div>
              <dt>Participants</dt>
              <dd>
                {participants.length} {c.mode === 1 ? "Hyperliquid account" : "wallet"}
                {participants.length === 1 ? "" : "s"}
              </dd>
            </div>
            <div>
              <dt>Everyone's price</dt>
              <dd>{batch && batch.avg > 0 ? price(batch.avg) : "no batch yet"}</dd>
            </div>
            <div>
              <dt>Concentration</dt>
              <dd>
                top 1: {(top1 * 100).toFixed(1)}%, top 10: {(top10 * 100).toFixed(1)}%
              </dd>
            </div>
            <div>
              <dt>Creator's share</dt>
              <dd>
                {(devShare * 100).toFixed(1)}%, {vesting(c.creatorVesting)}
              </dd>
            </div>
            <div>
              <dt>Fee policy</dt>
              <dd>
                bid {p.bidBps / 100}, stakers {p.stakersBps / 100}, team {p.teamBps / 100}, platform {p.platformBps / 100}
              </dd>
            </div>
            <div>
              <dt>Policy bounds</dt>
              <dd>locked, {durationAdj(c.bounds.timelock)} timelock</dd>
            </div>
          </dl>
          {fired && state.fired && (
            <Link className="link cert-link" href={`/certificate/${state.fired.token}`}>
              Read the full certificate
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
