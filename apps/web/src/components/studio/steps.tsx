"use client";

import { explorerAddress } from "@updraft/sdk";
import { type ReactNode, useEffect, useState } from "react";
import { type Checked, type Draft, type Env, PRESETS } from "./draft";
import { DurationInput, Field, Seg, Switch, TextInput } from "./fields";
import { BoundsRail, ClockFigure, FlockFigure, SplitBar, VestingFigure } from "./figures";
import { fmtAmount, fmtDuration, pct, short, toLocalInput } from "./format";

export interface StepProps {
  d: Draft;
  set: (patch: Partial<Draft>) => void;
  err: (field: string) => string | null;
  env: Env;
  chk: Checked;
  quoteName: string | null;
  rules: { description?: string[] } | null;
  clockReady: boolean;
}

export function StepHead({ n, title, sub }: { n: number; title: string; sub: ReactNode }) {
  return (
    <header className="sd-stephead">
      <p className="cap">
        Step {n} of 7
      </p>
      <h2 id="sd-step-title" tabIndex={-1}>
        {title}
      </h2>
      <p className="sd-sub">{sub}</p>
    </header>
  );
}

export function TokenStep({ d, set, err, env, quoteName }: StepProps) {
  return (
    <>
      <StepHead n={1} title="Name the token" sub="Ascend deploys it at T0. Its address is fixed by the round, the name and the symbol, so participants can check it before they commit." />
      <div className="sd-grid">
        <Field id="sd-name" label="Name" error={err("name")} hint="As wallets and explorers will show it." className="wide">
          <TextInput id="sd-name" big value={d.name} onChange={(name) => set({ name })} placeholder="Starling" maxLength={48} error={err("name")} hint />
        </Field>
        <Field id="sd-symbol" label="Symbol" error={err("symbol")} hint="The ticker, usually 3 to 6 letters.">
          <TextInput id="sd-symbol" value={d.symbol} onChange={(symbol) => set({ symbol: symbol.replace(/\s/g, "") })} placeholder="STRL" maxLength={12} error={err("symbol")} hint />
        </Field>
        <div className="sd-field">
          <span className="sd-label" id="sd-quote-l">
            Raise in
          </span>
          <Seg
            label="Quote token"
            value={d.quote}
            onChange={(quote) => set({ quote })}
            options={[
              { value: "usdc", label: "USDC" },
              { value: "mnvdax", label: "mNVDAx" },
            ]}
          />
          {err("quote") ? (
            <p className="sd-err" role="alert">
              {err("quote")}
            </p>
          ) : (
            <p className="sd-hint">
              {quoteName ? <>{quoteName}. </> : null}
              Commits, caps and the raise are all in {env.quote.symbol}.
            </p>
          )}
        </div>
      </div>
      <p className="cap sd-aside">
        Ascend testnet’s quote tokens are mocks with no backing. Contracts count what they actually hold, never what they were told.
      </p>
    </>
  );
}

export function WindowsStep({ d, set, err, chk, clockReady }: StepProps) {
  const preset = PRESETS.find((p) => p.lock.v === d.lock.v && p.lock.unit === d.lock.unit && p.t0.v === d.t0.v && p.t0.unit === d.t0.unit && p.fireBy.v === d.fireBy.v && p.fireBy.unit === d.fireBy.unit);
  return (
    <>
      <StepHead n={2} title="Set the windows" sub="Four moments, always in this order: commits open, withdrawals lock, T0 (the round can fire), and the fire-by deadline." />
      <div className="sd-presets" role="group" aria-label="Presets">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" aria-pressed={preset?.id === p.id} onClick={() => set({ lock: p.lock, t0: p.t0, fireBy: p.fireBy })}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="sd-grid">
        <div className="sd-field wide">
          <span className="sd-label">Commits open</span>
          <div className="sd-row">
            <Seg
              label="When commits open"
              value={d.openNow ? "now" : "later"}
              onChange={(v) => set({ openNow: v === "now", openAt: v === "later" && !d.openAt ? toLocalInput(Math.floor(Date.now() / 1000) + 3600) : d.openAt })}
              options={[
                { value: "now", label: "As soon as it’s created" },
                { value: "later", label: "Later" },
              ]}
            />
            {!d.openNow && (
              <div className={`sd-input date${err("openAt") ? " bad" : ""}`}>
                <input
                  id="sd-openAt"
                  type="datetime-local"
                  aria-label="Opening time, your local time"
                  value={d.openAt}
                  onChange={(e) => set({ openAt: e.target.value })}
                  aria-invalid={err("openAt") ? true : undefined}
                  aria-describedby={err("openAt") ? "sd-openAt-err" : undefined}
                />
              </div>
            )}
          </div>
          {err("openAt") && (
            <p className="sd-err" id="sd-openAt-err" role="alert">
              {err("openAt")}
            </p>
          )}
        </div>
        <Field id="sd-lock" label="Withdrawals lock" error={err("lock")} hint="After opening. Until the lock, anyone can take their commit back.">
          <DurationInput id="sd-lock" value={d.lock} onChange={(lock) => set({ lock })} error={err("lock")} hint />
        </Field>
        <Field id="sd-t0" label="T0, the round can fire" error={err("t0")} hint="After the lock. In between, people can still join but nobody can leave. 0 makes them the same moment.">
          <DurationInput id="sd-t0" value={d.t0} onChange={(t0) => set({ t0 })} error={err("t0")} hint />
        </Field>
        <Field id="sd-fireBy" label="Fire-by deadline" error={err("fireBy")} hint="After T0, at most 7 days. Anyone can send the fire transaction until then; if nobody does, everyone is refunded.">
          <DurationInput id="sd-fireBy" value={d.fireBy} onChange={(fireBy) => set({ fireBy })} error={err("fireBy")} hint />
        </Field>
      </div>
      <ClockFigure times={chk.times} n={1} ready={clockReady} />
    </>
  );
}

export function RaiseStep({ d, set, err, env, chk }: StepProps) {
  const q = env.quote;
  const r = chk.raise;
  const wallets = r && r.walletCap > 0n && r.maxRaise > 0n ? Number((r.maxRaise + r.walletCap - 1n) / r.walletCap) : null;
  const minWallets = r && r.walletCap > 0n && r.minRaise > 0n ? Number((r.minRaise + r.walletCap - 1n) / r.walletCap) : null;
  const notes: string[] = [];
  if (r && r.walletCap > r.maxRaise && r.maxRaise > 0n) notes.push("One wallet could fill the whole round on its own. A lower wallet cap spreads it wider.");
  if (r && r.creatorCap > r.walletCap) notes.push("You’d be allowed to commit more than any other wallet. Participants will see that on the round page.");
  return (
    <>
      <StepHead n={3} title="Size the raise" sub={`All in ${q.symbol}. Whatever is committed by T0, up to the maximum, becomes one buy on Ascend at one average price.`} />
      <div className="sd-grid">
        <Field id="sd-minRaise" label="Minimum raise" error={err("minRaise")} hint="Below this at T0, the round refunds everyone instead of firing.">
          <TextInput id="sd-minRaise" inputMode="decimal" value={d.minRaise} onChange={(minRaise) => set({ minRaise })} suffix={q.symbol} error={err("minRaise")} hint />
        </Field>
        <Field
          id="sd-maxRaise"
          label="Maximum raise"
          error={err("maxRaise")}
          hint={
            env.capacity !== null ? (
              <>
                Ascend’s curve can absorb up to {fmtAmount(env.capacity, q.decimals)} {q.symbol} for this token{env.wallet ? "" : " (about; exact once a wallet is connected)"}. Anything committed above the maximum is refunded pro-rata.
              </>
            ) : (
              "Reading Ascend’s curve capacity…"
            )
          }
        >
          <TextInput id="sd-maxRaise" inputMode="decimal" value={d.maxRaise} onChange={(maxRaise) => set({ maxRaise })} suffix={q.symbol} error={err("maxRaise")} hint />
        </Field>
        <Field id="sd-walletCap" label="Wallet cap" error={err("walletCap")} hint="The most one wallet may hold in the round.">
          <TextInput id="sd-walletCap" inputMode="decimal" value={d.walletCap} onChange={(walletCap) => set({ walletCap })} suffix={q.symbol} error={err("walletCap")} hint />
        </Field>
        <Field id="sd-creatorCap" label="Your own cap" error={err("creatorCap")} hint="You commit like everyone else, at the same price, up to this. 0 keeps you out.">
          <TextInput id="sd-creatorCap" inputMode="decimal" value={d.creatorCap} onChange={(creatorCap) => set({ creatorCap })} suffix={q.symbol} error={err("creatorCap")} hint />
        </Field>
        <Field id="sd-minCommit" label="Smallest commit" error={err("minCommit")} hint="Above zero and no more than the wallet cap. A partial withdrawal can’t leave less than this behind.">
          <TextInput id="sd-minCommit" inputMode="decimal" value={d.minCommit} onChange={(minCommit) => set({ minCommit })} suffix={q.symbol} error={err("minCommit")} hint />
        </Field>
      </div>
      {notes.length > 0 && (
        <ul className="sd-notes">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <FlockFigure n={2} wallets={wallets} minWallets={minWallets} cap={r ? `${fmtAmount(r.walletCap, q.decimals)} ${q.symbol}` : ""} />
    </>
  );
}

export function ModeStep({ d, set, err, env, rules }: StepProps) {
  return (
    <>
      <StepHead n={4} title="Choose who can join" sub="Open rounds cap each wallet. Verified rounds give one place to each verified Hyperliquid account, so one person can’t split into many wallets." />
      <div className="sd-choices" role="radiogroup" aria-label="Round mode">
        <label className="sd-choice">
          <input type="radio" name="sd-mode" checked={d.mode === 0} onChange={() => set({ mode: 0 })} />
          <span className="t">Open</span>
          <span>Any wallet can join, up to the wallet cap. No identity check and no trusted signer: the contracts alone decide.</span>
        </label>
        <label className="sd-choice">
          <input type="radio" name="sd-mode" checked={d.mode === 1} onChange={() => set({ mode: 1 })} />
          <span className="t">Verified</span>
          <span>
            One place per Hyperliquid account. Before a wallet’s first commit, Updraft’s attestor checks the account’s public history and signs a voucher for this round.
          </span>
        </label>
      </div>
      {err("mode") && (
        <p className="sd-err" role="alert">
          {err("mode")}
        </p>
      )}
      {d.mode === 1 && (
        <div className="sd-inset">
          <h3 className="sd-h4">The rules every Verified round uses</h3>
          {rules?.description ? (
            <ol className="sd-rules">
              {rules.description.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
          ) : (
            <p className="sd-hint">Reading the published rules…</p>
          )}
          <p className="cap">
            Attestor{" "}
            <a className="mono" href={explorerAddress(env.attestor)} target="_blank" rel="noreferrer">
              {short(env.attestor)}
            </a>
            {env.attestorAllowed === true ? ", approved by the factory." : env.attestorAllowed === false ? ", not approved by the factory right now." : "."} It is a trusted signer: if you’d rather depend on nobody, choose Open.
          </p>
        </div>
      )}
    </>
  );
}

export function VestingStep({ d, set, err, chk }: StepProps) {
  const allAtT0 = d.pTge.trim() === "100";
  const v = chk.vesting;
  const minCliff = v ? v.pCliff + v.pDuration : null;
  return (
    <>
      <StepHead n={5} title="Set the unlocks" sub="Participants’ tokens can unlock at T0 or over up to 30 days. Yours unlock in public, on a schedule everyone can read, and never before theirs." />
      <div className="sd-cols">
        <section aria-labelledby="sd-v-p">
          <h3 className="sd-h4" id="sd-v-p">
            Participants
          </h3>
          <Field id="sd-pTge" label="Unlocked at T0" error={err("pTge")} hint="100% means tokens are free the moment they land.">
            <TextInput id="sd-pTge" inputMode="decimal" value={d.pTge} onChange={(pTge) => set({ pTge })} suffix="%" error={err("pTge")} hint />
          </Field>
          <Field id="sd-pCliff" label="Cliff" error={err("pCliff")} hint={allAtT0 ? "Nothing left to lock." : "Nothing more unlocks until it ends."}>
            <DurationInput id="sd-pCliff" value={allAtT0 ? { v: "0", unit: d.pCliff.unit } : d.pCliff} onChange={(pCliff) => set({ pCliff })} disabled={allAtT0} error={err("pCliff")} hint />
          </Field>
          <Field id="sd-pDuration" label="Then unlocks evenly over" error={err("pDuration")} hint={allAtT0 ? "Nothing left to schedule." : "Cliff and schedule together: at most 30 days."}>
            <DurationInput id="sd-pDuration" value={allAtT0 ? { v: "0", unit: d.pDuration.unit } : d.pDuration} onChange={(pDuration) => set({ pDuration })} disabled={allAtT0} error={err("pDuration")} hint />
          </Field>
        </section>
        <section aria-labelledby="sd-v-c">
          <h3 className="sd-h4" id="sd-v-c">
            You, the creator
          </h3>
          <div className="sd-field">
            <span className="sd-label">Unlocked at T0</span>
            <div className="sd-fixed">
              0% <span>fixed for every creator</span>
            </div>
          </div>
          <Field
            id="sd-cCliff"
            label="Cliff"
            error={err("cCliff")}
            hint={
              minCliff === null
                ? "At least as long as the participants’ cliff and schedule together."
                : minCliff === 0
                  ? "Any length, since participants are fully unlocked at T0."
                  : `At least ${fmtDuration(minCliff)}: until the last participant has fully unlocked.`
            }
          >
            <DurationInput id="sd-cCliff" value={d.cCliff} onChange={(cCliff) => set({ cCliff })} error={err("cCliff")} hint />
          </Field>
          <Field id="sd-cDuration" label="Then unlocks evenly over" error={err("cDuration")} hint="Longer than zero. No upper limit.">
            <DurationInput id="sd-cDuration" value={d.cDuration} onChange={(cDuration) => set({ cDuration })} error={err("cDuration")} hint />
          </Field>
        </section>
      </div>
      <div className="sd-why">
        <svg viewBox="0 0 26 18" aria-hidden="true">
          <path d="M1 10 L9 4 L13 8 L17 4 L25 10 L17 7 L13 11.5 L9 7 Z" fill="#231e19" />
          <path d="M0 16.5 Q13 18 26 16.5" stroke="#231e19" strokeWidth="1.2" fill="none" />
        </svg>
        <p>
          <b>Why you’re locked at least as long as everyone.</b> You buy at the same price as the crowd. If your tokens could unlock first, you could sell into
          the people who backed you before they were able to sell at all. The factory refuses any round where that’s possible, so your cliff runs at least until
          the last participant token is free.
        </p>
      </div>
      <VestingFigure n={3} v={v} />
    </>
  );
}

const pctText = (bps: number) => String(bps / 100);

function PercentInput({ id, value, onChange, label, error }: { id: string; value: number; onChange: (bps: number) => void; label: string; error?: boolean }) {
  const [s, setS] = useState(pctText(value));
  useEffect(() => {
    setS((cur) => (Math.round(Number(cur) * 100) === value ? cur : pctText(value)));
  }, [value]);
  return (
    <span className={`sd-pct${error ? " bad" : ""}`}>
      <input
        id={id}
        aria-label={label}
        inputMode="decimal"
        value={s}
        onChange={(e) => {
          setS(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 100) onChange(Math.round(n * 100));
        }}
        onBlur={() => setS(pctText(value))}
        aria-invalid={error ? true : undefined}
      />
      %
    </span>
  );
}

function LegEditor({
  name,
  label,
  value,
  min,
  max,
  span,
  onValue,
  onMin,
  onMax,
  err,
}: {
  name: string;
  label: string;
  value: number;
  min: number;
  max: number;
  span: number;
  onValue: (v: number) => void;
  onMin: (v: number) => void;
  onMax: (v: number) => void;
  err: (f: string) => string | null;
}) {
  const e = err(name) ?? err(`${name}Min`) ?? err(`${name}Max`);
  return (
    <div className="sd-leg">
      <div className="sd-legrow edit">
        <label htmlFor={`sd-${name}`}>{label}</label>
        <div className="sd-range">
          <span className="b" style={{ left: `${Math.min(min, max) / 100}%`, width: `${Math.max(0, max - min) / 100}%` }} aria-hidden="true" />
          <input
            style={{ left: "-10px", width: `calc(${span / 100}% + 20px)` }}
            id={`sd-${name}`}
            type="range"
            min={0}
            max={span}
            step={100}
            value={value}
            onChange={(ev) => onValue(Number(ev.target.value))}
            aria-valuetext={pct(value)}
            aria-describedby={e ? `sd-${name}-err` : undefined}
          />
        </div>
        <span className="v num">{pct(value)}</span>
      </div>
      <div className="sd-bounds">
        <span>Can move between</span>
        <PercentInput id={`sd-${name}Min`} label={`${label}: lowest`} value={min} onChange={onMin} error={!!err(`${name}Min`)} />
        <span>and</span>
        <PercentInput id={`sd-${name}Max`} label={`${label}: highest`} value={max} onChange={onMax} error={!!err(`${name}Max`)} />
      </div>
      {e && (
        <p className="sd-err" id={`sd-${name}-err`} role="alert">
          {e}
        </p>
      )}
    </div>
  );
}

export function FeesStep({ d, set, err, env }: StepProps) {
  const P = env.params.platformFeeBps;
  const span = 10_000 - P;
  const sum = d.bid + d.stakers + d.team;
  const left = span - sum;
  const legs = [
    { key: "bid", label: "Ascend’s bid", value: d.bid, min: d.bidMin, max: d.bidMax },
    { key: "stakers", label: "Stakers", value: d.stakers, min: d.stakersMin, max: d.stakersMax },
    { key: "team", label: "Team", value: d.team, min: d.teamMin, max: d.teamMax },
  ] as const;
  return (
    <>
      <StepHead
        n={6}
        title="Write the fee policy"
        sub="Ascend pays creator fees to whoever holds the creator role. Here that’s a vault, and the vault splits every fee by this policy. You can move the split later, but only inside the bounds you set now, and only after a timelock."
      />
      <SplitBar n={4} split={{ bid: d.bid, stakers: d.stakers, team: d.team, platform: P }} caption="Where every 100 of creator fees goes under this policy." />
      <div className="sd-legs">
        <BoundsRail label="Platform" min={P} max={P} value={P} fixed />
        {legs.map((l) => (
          <LegEditor
            key={l.key}
            name={l.key}
            label={l.label}
            value={l.value}
            min={l.min}
            max={l.max}
            span={span}
            err={err}
            onValue={(v) => set({ [l.key]: v } as Partial<Draft>)}
            onMin={(v) => set({ [`${l.key}Min`]: v } as Partial<Draft>)}
            onMax={(v) => set({ [`${l.key}Max`]: v } as Partial<Draft>)}
          />
        ))}
      </div>
      <div className={`sd-sum${left === 0 ? " ok" : ""}`} id="sd-sum" tabIndex={-1}>
        <span>
          Bid, stakers and team: <b className="num">{pct(sum)}</b> of {pct(span)}
          {left !== 0 && <> ({left > 0 ? `${pct(left)} left to place` : `${pct(-left)} too much`})</>}
        </span>
        {left !== 0 && (
          <span className="sd-fixers">
            {legs.map((l) => {
              const next = l.value + left;
              if (next < 0 || next > span) return null;
              return (
                <button key={l.key} type="button" onClick={() => set({ [l.key]: next } as Partial<Draft>)}>
                  {left > 0 ? `Give ${pct(left)} to` : `Take ${pct(-left)} from`} {l.label === "Ascend’s bid" ? "the bid" : l.label.toLowerCase()}
                </button>
              );
            })}
          </span>
        )}
      </div>
      <p className="cap sd-aside">
        The platform’s {pct(P)} is fixed and goes to $DRAFT stakers. The team’s share can never go above {pct(env.params.maxTeamBps)}. When nobody has staked your
        token, the stakers’ share of quote fees goes to Ascend’s bid instead, and their share of token fees to the $DRAFT basket.
      </p>
      <div className="sd-grid">
        <Field
          id="sd-timelock"
          label="Timelock on every change"
          error={err("timelock")}
          hint={`At least ${fmtDuration(env.params.minPolicyTimelock)} on testnet. 72 hours gives holders three days’ notice; demo rounds can use minutes.`}
        >
          <DurationInput id="sd-timelock" value={d.timelock} onChange={(timelock) => set({ timelock })} error={err("timelock")} hint />
        </Field>
        <Field
          id="sd-listingCap"
          label="HyperCore listing set-aside"
          error={err("listingCap")}
          hint={`Ascend can set part of the quote fees aside toward a HyperCore spot listing, up to this cap. 0 for none.`}
        >
          <TextInput id="sd-listingCap" inputMode="decimal" value={d.listingCap} onChange={(listingCap) => set({ listingCap })} suffix={env.quote.symbol} error={err("listingCap")} hint />
        </Field>
        <div className="sd-field wide">
          <Switch id="sd-exit" checked={d.exitEnabled} onChange={(exitEnabled) => set({ exitEnabled })} label="Allow me to move Ascend’s creator role out of the vault later" />
          <p className="sd-hint">
            {d.exitEnabled
              ? "You’ll be able to queue an exit. It waits the same timelock, everyone can see it coming, and fees earned until then still follow the policy."
              : "Off: the vault holds the creator role for good, and the policy is the only way fees are ever split."}
          </p>
        </div>
      </div>
    </>
  );
}
