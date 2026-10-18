"use client";

import { explorerAddress, explorerTx } from "@updraft/sdk";
import Link from "next/link";
import type { Address } from "viem";
import { type Checked, type Draft, type Env, STEPS } from "./draft";
import { Check, TxNote } from "./fields";
import { fmtAmount, fmtDuration, fmtTime, pct, short } from "./format";
import type { TxState } from "./tx";

function Addr({ a, pending }: { a: Address | null; pending: string }) {
  if (!a) return <dd className="sd-muted">{pending}</dd>;
  return (
    <dd>
      <a className="mono" href={explorerAddress(a)} target="_blank" rel="noreferrer" title={a}>
        {short(a)}
      </a>
    </dd>
  );
}

/** The rules as participants will read them on the round page. */
export function rulesRows(d: Draft, env: Env, chk: Checked): [string, string][] {
  const q = env.quote.symbol;
  const amt = (v: bigint) => fmtAmount(v, env.quote.decimals);
  const r = chk.raise;
  const t = chk.times;
  const v = chk.vesting;
  const P = env.params.platformFeeBps;
  return [
    ["Mode", d.mode === 1 ? "Verified: one place per Hyperliquid account" : "Open: any wallet, capped"],
    ["Caps", r ? `${amt(r.walletCap)} ${q} a wallet, at least ${amt(r.minCommit)} a commit` : "not set"],
    ["Raise", r ? `At least ${amt(r.minRaise)}, at most ${amt(r.maxRaise)} ${q}` : "not set"],
    ["Opens", t ? (d.openNow ? "When the round is created" : fmtTime(t.openAt)) : "not set"],
    ["Lock", t ? `${fmtTime(t.lockAt)}. Withdrawals stop` : "not set"],
    ["T0", t ? `${fmtTime(t.closeAt)}. The round can fire` : "not set"],
    ["Fire by", t ? `${fmtTime(t.fireBy)}, or everyone is refunded` : "not set"],
    [
      "The creator",
      r && v
        ? `At most ${amt(r.creatorCap)} ${q}. Nothing at T0, a ${fmtDuration(v.cCliff)} cliff, then ${fmtDuration(v.cDuration)} linear`
        : "not set",
    ],
    [
      "Participants",
      v
        ? v.pTgeBps === 10_000
          ? "Everything unlocks at T0"
          : `${pct(v.pTgeBps)} at T0${v.pCliff ? `, a ${fmtDuration(v.pCliff)} cliff` : ""}, then ${fmtDuration(v.pDuration)} linear`
        : "not set",
    ],
    [
      "Fee policy",
      `Ascend’s bid ${pct(d.bid)} (${pct(d.bidMin)} to ${pct(d.bidMax)}), stakers ${pct(d.stakers)} (${pct(d.stakersMin)} to ${pct(d.stakersMax)}), team ${pct(d.team)} (${pct(d.teamMin)} to ${pct(d.teamMax)}), platform ${pct(P)}. Changes wait ${chk.timelock !== null ? fmtDuration(chk.timelock) : "?"}`,
    ],
    ["Listing", d.listingCap.trim() === "0" || d.listingCap.trim() === "" ? "No HyperCore listing set-aside" : `Set-aside up to ${d.listingCap} ${q}`],
    ["Creator role", d.exitEnabled ? "The creator may move it out of the vault, after the timelock" : "Stays with the vault for good"],
    ["Refunds", "If the minimum isn’t reached, the fire-by time passes, or Ascend changes under the round"],
  ];
}

export function SummaryPlate({
  d,
  env,
  chk,
  predictedRound,
  predictedToken,
  onStep,
  onCreate,
  tx,
  created,
  connect,
}: {
  d: Draft;
  env: Env;
  chk: Checked;
  predictedRound: Address | null;
  predictedToken: Address | null;
  onStep: (i: number) => void;
  onCreate: () => void;
  tx: { state: TxState; busy: boolean };
  created: { round: Address; token: Address; hash: string } | null;
  connect: { injected: () => void; demo: () => void } | null;
}) {
  const q = env.quote.symbol;
  const bad = (step: number) => chk.problems.some((p) => p.step === step);
  const r = chk.raise;
  const v = chk.vesting;
  const t = chk.times;
  const amt = (x: bigint) => fmtAmount(x, env.quote.decimals);
  const blocking = chk.problems;
  const steps = [...new Set(blocking.map((p) => p.step))];

  const means: { step: number; text: string }[] = [
    {
      step: 1,
      text: "Anyone can join until T0 and leave until the lock. At T0 one transaction buys the whole batch at one average price, yours included.",
    },
    {
      step: 2,
      text: `If less than ${r ? `${amt(r.minRaise)} ${q}` : "the minimum"} is in by T0, or nobody fires by ${t ? fmtTime(t.fireBy) : "the fire-by time"}, every commit is refunded.`,
    },
    {
      step: 3,
      text: d.mode === 1 ? "One place per verified Hyperliquid account, checked against the published rules." : `Any wallet can join, up to ${r ? `${amt(r.walletCap)} ${q}` : "the wallet cap"}. No identity check and no trusted signer.`,
    },
    {
      step: 4,
      text: v
        ? `Your tokens unlock only after everyone else’s: nothing for ${fmtDuration(v.cCliff)}, then evenly over ${fmtDuration(v.cDuration)}.`
        : "Your tokens unlock only after everyone else’s.",
    },
    {
      step: 5,
      text: `Creator fees go to a vault, not to you. The split moves only inside its bounds, and every move waits ${chk.timelock !== null ? fmtDuration(chk.timelock) : "its timelock"}.`,
    },
  ];

  return (
    <aside className="sd-plate sd-summary" aria-labelledby="sd-sum-title">
      <div className="sd-sumtop">
        <p className="cap">Draft plate</p>
        <span className="chip ex">{created ? "On-chain" : "Not yet on-chain"}</span>
      </div>
      <h2 id="sd-sum-title" className={d.name.trim() ? undefined : "empty"}>
        {d.name.trim() || "Your token"}
        <small>{d.symbol.trim() ? `$${d.symbol.trim()}` : "$TICKER"}</small>
      </h2>
      <p className="cap">
        {d.mode === 1 ? "A Verified round" : "An Open round"} on Ascend, raising in {q}.
      </p>

      <dl className="sd-facts sd-addrs">
        <div>
          <dt>Round address</dt>
          <Addr a={predictedRound} pending={env.wallet ? "reading…" : "connect a wallet"} />
        </div>
        <div>
          <dt>Token address</dt>
          <Addr a={predictedToken} pending={env.wallet ? (d.name && d.symbol ? "reading…" : "needs a name and symbol") : "connect a wallet"} />
        </div>
      </dl>
      <p className="sd-fine">Both are known before anything is sent: the round from your address and a salt, the token from the round, the name and the symbol.</p>

      <h3 className="sd-h4">What participants will see</h3>
      <dl className="sd-facts">
        <div>
          <dt>Raise</dt>
          <dd>{r ? `${amt(r.minRaise)} to ${amt(r.maxRaise)} ${q}` : "not set"}</dd>
        </div>
        <div>
          <dt>Per wallet</dt>
          <dd>{r ? `up to ${amt(r.walletCap)} ${q}` : "not set"}</dd>
        </div>
        <div>
          <dt>Lock</dt>
          <dd>{t ? fmtTime(t.lockAt) : "…"}</dd>
        </div>
        <div>
          <dt>T0</dt>
          <dd>{t ? fmtTime(t.closeAt) : "…"}</dd>
        </div>
        <div>
          <dt>Your cap</dt>
          <dd>{r ? `${amt(r.creatorCap)} ${q}` : "not set"}</dd>
        </div>
        <div>
          <dt>Fees</dt>
          <dd className="num">
            bid {d.bid / 100}, stakers {d.stakers / 100}, team {d.team / 100}, platform {env.params.platformFeeBps / 100}
          </dd>
        </div>
      </dl>

      <h3 className="sd-h4">What this means</h3>
      <ul className="sd-means">
        {means.map((m) => (
          <li key={m.step} className={bad(m.step) ? "bad" : undefined}>
            <Check ok={!bad(m.step)} />
            <span>
              {m.text}
              {bad(m.step) && (
                <>
                  {" "}
                  <button type="button" className="sd-inline" onClick={() => onStep(m.step)}>
                    Fix step {m.step + 1}
                  </button>
                </>
              )}
            </span>
          </li>
        ))}
        <li>
          <Check ok />
          <span>Once it’s created, nothing on this plate can be changed, by you or by Updraft.</span>
        </li>
      </ul>

      {created ? (
        <div className="sd-created" role="status">
          <p>
            <b>Round created.</b> It’s live at{" "}
            <a className="mono" href={explorerAddress(created.round)} target="_blank" rel="noreferrer">
              {short(created.round)}
            </a>
            ; the token will deploy at{" "}
            <a className="mono" href={explorerAddress(created.token)} target="_blank" rel="noreferrer">
              {short(created.token)}
            </a>{" "}
            at T0.
          </p>
          <div className="sd-actions">
            <Link className="btn" href={`/rounds/${created.round}`}>
              Open the round page
            </Link>
            <Link className="link" href={`/studio/${created.round}`}>
              Open the creator console
            </Link>
          </div>
          <a className="sd-fine" href={explorerTx(created.hash)} target="_blank" rel="noreferrer">
            Creation transaction {created.hash.slice(0, 10)}…
          </a>
        </div>
      ) : (
        <>
          {steps.length > 0 && (
            <div className="sd-todo">
              <p>
                {blocking.length === 1 ? "One thing" : `${blocking.length} things`} to settle before you can create it:
              </p>
              <ul>
                {blocking.slice(0, 6).map((p) => (
                  <li key={`${p.step}-${p.field}`}>
                    <button type="button" className="sd-inline" onClick={() => onStep(p.step)}>
                      {STEPS[p.step]}
                    </button>{" "}
                    {p.msg}
                  </li>
                ))}
                {blocking.length > 6 && <li>and {blocking.length - 6} more.</li>}
              </ul>
            </div>
          )}
          {connect && (
            <div className="sd-connect">
              <button type="button" className="sd-dark" onClick={connect.injected}>
                Connect a browser wallet
              </button>
              <button type="button" className="sd-ghost" onClick={connect.demo}>
                Use a demo wallet
              </button>
            </div>
          )}
          <button type="button" className="btn sd-create" disabled={blocking.length > 0 || tx.busy} onClick={onCreate}>
            {tx.busy ? "Creating the round…" : "Create round"}
          </button>
          <TxNote state={tx.state} />
          <p className="sd-fine">One transaction to the Updraft factory. It checks every rule above again, on-chain.</p>
        </>
      )}
    </aside>
  );
}
