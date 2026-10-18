"use client";

import { useState } from "react";
import { type Address, parseUnits } from "viem";
import type { Attestation, RoundState } from "@updraft/sdk";
import { useWallet } from "@/lib/wallet";
import type { ErrorContext } from "./errors";
import { type Phase, price, same, tokens, usdc, when } from "./format";
import type { Batch, Position, RoundParams, TxState } from "./hooks";
import { TxStatus } from "./TxStatus";

export type CommitMode = "commit" | "withdraw";
type Voucher = Extract<Attestation, { ok: true }>;

/** Parses a USDC amount typed by a person: digits, one dot, at most 6 decimals. */
export function parseAmount(text: string): bigint | null {
  const t = text.replace(/[,\s_]/g, "");
  if (t === "") return 0n;
  if (!/^\d*\.?\d{0,6}$/.test(t) || t === ".") return null;
  return parseUnits(t, 6);
}

const toText = (raw: bigint) => usdc(raw).replace(/,/g, "");

export function commitCheck(args: {
  mode: CommitMode;
  amount: bigint | null;
  state: RoundState;
  position: Position | undefined;
  wallet: Address | null;
}): string | null {
  const { mode, amount, state, position, wallet } = args;
  if (amount === null) return "Use digits and at most six decimals, like 250 or 12.5.";
  if (amount === 0n) return null;
  const r = state.config.raise;
  const committed = position?.committed ?? 0n;
  if (mode === "commit") {
    const cap = same(wallet, state.config.creator) ? r.creatorCap : r.walletCap;
    const room = cap > committed ? cap - committed : 0n;
    if (amount < r.minCommit) return `The smallest commit here is ${usdc(r.minCommit)} USDC.`;
    if (amount > room)
      return room === 0n
        ? `You're at this round's cap of ${usdc(cap)} USDC.`
        : `That's ${usdc(amount - room)} USDC over your cap. You can add up to ${usdc(room)} USDC in this round.`;
    if (position && amount > position.balance) return `Your wallet holds ${usdc(position.balance)} USDC.`;
    return null;
  }
  if (amount > committed) return `You have ${usdc(committed)} USDC in the round, so that's the most you can withdraw.`;
  const left = committed - amount;
  if (left !== 0n && left < r.minCommit)
    return `A withdrawal has to leave nothing or at least ${usdc(r.minCommit)} USDC: withdraw all ${usdc(committed)}, or at most ${usdc(committed - r.minCommit)}.`;
  return null;
}

export function CommitPanel({
  state,
  params,
  phase,
  position,
  batch,
  mode,
  setMode,
  text,
  setText,
  voucher,
  tx,
  run,
  ctx,
}: {
  state: RoundState;
  params: RoundParams | undefined;
  phase: Phase;
  position: Position | undefined;
  batch: Batch | undefined;
  mode: CommitMode;
  setMode: (m: CommitMode) => void;
  text: string;
  setText: (t: string) => void;
  voucher: Voucher | null;
  tx: TxState | null;
  run: (label: string, send: () => Promise<`0x${string}`>, opts: { ctx?: ErrorContext; done: string | (() => Promise<string>) }) => Promise<boolean>;
  ctx: ErrorContext;
}) {
  const { address: wallet, updraft, connectInjected, startDemo } = useWallet();
  const [demoNote, setDemoNote] = useState<string | null>(null);
  const cfg = state.config;
  const r = cfg.raise;
  const sym = cfg.symbol;
  const open = phase === "open" || phase === "locked";
  const canWithdraw = phase === "open";
  const isCreator = same(wallet, cfg.creator);
  const cap = isCreator ? r.creatorCap : r.walletCap;
  const committed = position?.committed ?? 0n;
  const amount = parseAmount(text);
  const problem = commitCheck({ mode, amount, state, position, wallet });
  const v = amount ?? 0n;
  const delta = problem ? 0n : mode === "commit" ? v : -v;
  const pos = committed + delta > 0n ? committed + delta : 0n;
  const share = batch && batch.total > 0 ? Number(pos) / 1e6 / batch.total : 0;
  const myTokens = batch ? batch.netTokens * share : 0;
  const myRefund = batch ? batch.oversubscribed * share : 0;
  const needsVoucher = cfg.mode === 1 && (!position || /^0x0+$/.test(position.identity)) && !voucher;
  const busy = tx?.phase === "signing" || tx?.phase === "pending";
  const room = cap > committed ? cap - committed : 0n;

  const quick = [25n, 100n, 250n, 1000n].map((n) => n * 1_000_000n).filter((n) => n >= r.minCommit && n <= room);
  const max = mode === "commit" ? (position && position.balance < room ? position.balance : room) : committed;

  const submit = async () => {
    if (!amount || problem) return;
    const label = mode === "commit" ? `Commit ${usdc(amount)} USDC` : `Withdraw ${usdc(amount)} USDC`;
    const ok =
      mode === "commit"
        ? await run(label, () => updraft.commit(state.address, amount, voucher ?? undefined), {
            ctx,
            done: `Committed ${usdc(amount)} USDC.${canWithdraw ? ` You can withdraw until the lock, ${when(cfg.windows.lockAt)}.` : ""}`,
          })
        : await run(label, () => updraft.withdraw(state.address, amount), {
            ctx,
            done: `Withdrew ${usdc(amount)} USDC. It's back in your wallet.`,
          });
    if (ok) setText("");
  };

  let cta: string;
  if (!open) cta = phase === "upcoming" ? `Commits open ${when(cfg.windows.openAt)}` : "Commits are closed";
  else if (needsVoucher && mode === "commit") cta = "Verify your Hyperliquid account first";
  else if (v > 0n) cta = `${mode === "commit" ? "Commit" : "Withdraw"} ${usdc(v)} USDC`;
  else cta = mode === "commit" ? "Enter an amount to commit" : "Enter an amount to withdraw";

  return (
    <section className="panel" id="p-commit" aria-labelledby="h-commit">
      <div className="panel-head">
        <h2 id="h-commit">Your commit</h2>
        <div className="seg" role="group" aria-label="Commit or withdraw">
          <button type="button" aria-pressed={mode === "commit"} onClick={() => setMode("commit")}>
            Commit
          </button>
          <button
            type="button"
            aria-pressed={mode === "withdraw"}
            disabled={!canWithdraw}
            title={canWithdraw ? undefined : `Withdrawals locked at ${when(cfg.windows.lockAt)}`}
            onClick={() => setMode("withdraw")}
          >
            Withdraw
          </button>
        </div>
      </div>

      <div className="field">
        <label htmlFor="amt">{mode === "commit" ? "Add USDC to the round" : "Take USDC back out (until the lock)"}</label>
        <div className={`amount${problem ? " bad" : ""}`}>
          <input
            id="amt"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={text}
            disabled={!open}
            aria-invalid={!!problem}
            aria-describedby="amt-err"
            onChange={(e) => setText(e.target.value)}
          />
          <span>USDC</span>
        </div>
        {open && (
          <div className="quick">
            {mode === "commit" &&
              quick.map((n) => (
                <button key={n.toString()} type="button" onClick={() => setText(toText(n))}>
                  {usdc(n)}
                </button>
              ))}
            {wallet && max > 0n && (
              <button type="button" onClick={() => setText(toText(max))}>
                Max
              </button>
            )}
          </div>
        )}
        <p className="err" id="amt-err" role="alert">
          {problem ?? ""}
        </p>
      </div>

      <dl className="rows">
        <div>
          <dt>You'd hold about</dt>
          <dd>
            {tokens(myTokens)} {sym}
            {myRefund >= 0.01 && <small> plus {myRefund.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC back</small>}
          </dd>
        </div>
        <div>
          <dt>Everyone's price</dt>
          <dd>
            {batch && batch.avg > 0 ? price(batch.avg) : "No batch yet"}{" "}
            <small>{delta !== 0n ? "with this change, if it fired now" : "if it fired now"}</small>
          </dd>
        </div>
        <div>
          <dt>Your position</dt>
          <dd>{usdc(pos)} USDC</dd>
        </div>
      </dl>

      <div className="capwrap">
        <div className="capbar" aria-hidden="true">
          <i style={{ width: `${Math.min(100, (Number(committed < pos ? committed : pos) / Number(cap || 1n)) * 100)}%` }} />
          <b style={{ width: `${mode === "commit" ? Math.min(100, (Number(pos > committed ? pos - committed : 0n) / Number(cap || 1n)) * 100) : 0}%` }} />
        </div>
        <div className="capnote">
          <span>
            {usdc(committed)} of {isCreator ? "the creator's" : "your"} {usdc(cap)} USDC cap committed
          </span>
          <span>{usdc(room)} left</span>
        </div>
      </div>

      <dl className="rows small">
        {wallet && (
          <div>
            <dt>In your wallet</dt>
            <dd>{position ? `${usdc(position.balance)} USDC` : "…"}</dd>
          </div>
        )}
        <div>
          <dt>Smallest commit</dt>
          <dd>{usdc(r.minCommit)} USDC</dd>
        </div>
        <div>
          <dt>Withdrawals lock</dt>
          <dd>{when(cfg.windows.lockAt)}</dd>
        </div>
      </dl>

      {wallet ? (
        <>
          <button
            type="button"
            className={`go${tx?.phase === "done" && !text ? " done" : ""}`}
            disabled={!open || !!problem || v === 0n || busy || (mode === "commit" && needsVoucher)}
            onClick={submit}
          >
            {busy ? "Waiting for the wallet…" : cta}
          </button>
          <TxStatus tx={tx} />
        </>
      ) : (
        <div className="connect">
          <button type="button" className="go" onClick={connectInjected}>
            Connect a browser wallet
          </button>
          <button
            type="button"
            className="ghost"
            onClick={async () => {
              setDemoNote("Funding a demo wallet with test USDC…");
              const res = await startDemo();
              setDemoNote(res.ok ? "Ready: test USDC and gas are on their way." : `Demo funds unavailable (${res.reason}).`);
            }}
          >
            Try with a demo wallet
          </button>
          <p className="fine" role="status">
            {demoNote ?? "The demo wallet lives in this browser only and holds testnet funds."}
          </p>
        </div>
      )}

      <div className="note">
        <svg viewBox="0 0 26 18" aria-hidden="true">
          <path d="M1 10 L9 4 L13 8 L17 4 L25 10 L17 7 L13 11.5 L9 7 Z" fill="#231e19" />
          <path d="M0 16.5 Q13 18 26 16.5" stroke="#231e19" strokeWidth="1.2" fill="none" />
        </svg>
        <span>
          The price moves as more people commit. Wherever it settles at T0, everyone in the round pays the same average, the creator
          included.
        </span>
      </div>
      <p className="fine">
        {canWithdraw ? `Withdraw any time until the lock (${when(cfg.windows.lockAt)}). ` : ""}
        {params
          ? `${params.parityBps / 100}% of the batch funds Ascend's own bid; ${params.platformTokenBps / 100}% of the tokens go to $DRAFT stakers. Both are in the price above.`
          : ""}
      </p>
    </section>
  );
}
