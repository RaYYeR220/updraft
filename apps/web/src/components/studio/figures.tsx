"use client";

import { useId } from "react";
import { fmtDuration, fmtTime, pct } from "./format";
import type { Times } from "./draft";

/** The perched starling from the field guide, feet at (6, 15.4). */
export function PerchDefs({ id }: { id: string }) {
  return (
    <defs>
      <symbol id={id} viewBox="0 0 12 16">
        <path d="M3.9 11.2 L0.7 15.7 L2.3 15.95 L5.4 12.4 Z" />
        <ellipse cx="5.7" cy="9.3" rx="3.15" ry="4.25" transform="rotate(-18 5.7 9.3)" />
        <circle cx="7.6" cy="4.3" r="2.05" />
        <path d="M9.35 3.75 L11.9 4.45 L9.35 5.05 Z" />
        <path d="M5.6 13.2 L5.9 15.6 M6.9 13 L7 15.6" stroke="currentColor" strokeWidth=".8" fill="none" />
      </symbol>
    </defs>
  );
}

const STRETCH = ["commit or withdraw", "commit only", "anyone can fire"] as const;

/** Windows as three stretches between four moments. Short stretches are widened so they stay readable. */
export function ClockFigure({ times, n, ready = true }: { times: Times | null; n: number; ready?: boolean }) {
  const spans = times
    ? [times.lockAt - times.openAt, times.closeAt - times.lockAt, times.fireBy - times.closeAt]
    : [3, 1, 2];
  const weights = spans.map((s) => (s <= 0 ? 0 : Math.max(Math.sqrt(s), 0.16 * Math.sqrt(Math.max(...spans)))));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const w = weights.map((x) => `${((x / total) * 100).toFixed(2)}%`);
  const marks = times
    ? [
        ["Opens", times.openAt],
        ["Lock", times.lockAt],
        ["T0", times.closeAt],
        ["Fire-by", times.fireBy],
      ]
    : [];
  return (
    <figure className="sd-fig sd-clockfig">
      <div className="sd-clockbar" aria-hidden="true">
        {(["a", "b", "c"] as const).map((k, i) =>
          spans[i] > 0 ? (
            <span key={k} className={k} style={{ width: w[i] }}>
              {weights[i] / total > 0.22 && <em>{STRETCH[i]}</em>}
            </span>
          ) : null,
        )}
      </div>
      <ul className="sd-clockkey" aria-hidden="true">
        {STRETCH.map((label, i) => (spans[i] > 0 ? <li key={label} className={(["a", "b", "c"] as const)[i]}>{label}</li> : null))}
      </ul>
      {times ? (
        <ol className="sd-moments">
          {marks.map(([label, ts], i) => (
            <li key={label as string}>
              <b>{label}</b>
              <span className="num">{fmtTime(ts as number)}</span>
              {i > 0 && <small>{fmtDuration((ts as number) - (marks[i - 1][1] as number))} later</small>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="sd-hint">{ready ? "Fill in the windows to see the dates." : "Reading the clock…"}</p>
      )}
      <figcaption className="cap">
        <b>Fig. {n}.</b> The round’s clock. Stretches are widened where they’re short, so each one stays readable; the dates
        are exact.
      </figcaption>
    </figure>
  );
}

/** The fewest wallets that can fill the round, one bird per wallet at the cap. */
export function FlockFigure({
  n,
  wallets,
  minWallets,
  cap,
}: {
  n: number;
  wallets: number | null;
  minWallets: number | null;
  cap: string;
}) {
  const id = useId().replace(/:/g, "");
  const MAX = 64;
  const per = wallets ? Math.max(1, Math.ceil(wallets / MAX)) : 1;
  const birds = wallets ? Math.ceil(wallets / per) : 0;
  const minBird = minWallets ? Math.min(birds, Math.ceil(minWallets / per)) : 0;
  const W = 640;
  const step = birds > 1 ? Math.min(26, (W - 40) / birds) : 0;
  const bw = Math.max(7, Math.min(15, step * 0.68 || 15));
  const x0 = 20;
  const wire = (x: number) => 60 + 12 * (x / W) * (1 - x / W);
  return (
    <figure className="sd-fig">
      <svg className="sd-flock" viewBox={`0 0 ${W} 74`} role="img" aria-label={wallets ? `At least ${wallets} wallets are needed to fill the round.` : "Raise not set yet."}>
        <PerchDefs id={id} />
        <path d={`M0 60 Q${W / 2} 66 ${W} 60`} stroke="#231e19" strokeWidth="1.4" fill="none" />
        {Array.from({ length: birds }, (_, i) => {
          const x = x0 + i * step;
          const h = (bw * 16) / 12;
          const reached = i < minBird;
          return (
            <use key={i} href={`#${id}`} x={x - bw / 2} y={wire(x) - h * 0.96} width={bw} height={h} fill={reached ? "#2e4527" : "#231e19"} color={reached ? "#2e4527" : "#231e19"} />
          );
        })}
        {minBird > 0 && minBird < birds && (
          <g>
            <line x1={x0 + (minBird - 0.5) * step} x2={x0 + (minBird - 0.5) * step} y1="18" y2="72" stroke="#2e4527" strokeWidth="1.5" strokeDasharray="3 3" />
          </g>
        )}
      </svg>
      <figcaption className="cap">
        <b>Fig. {n}.</b>{" "}
        {wallets ? (
          <>
            At the {cap} cap it takes at least <b className="num">{wallets.toLocaleString("en-US")}</b> wallets to fill this round
            {minWallets ? <>, and {minWallets.toLocaleString("en-US")} to reach the minimum (the dashed line)</> : null}.
            {per > 1 ? <> One bird stands for {per} wallets.</> : null}
          </>
        ) : (
          "Set the raise and the wallet cap to see how many wallets it takes."
        )}
      </figcaption>
    </figure>
  );
}

/** Unlocked share over time since T0: participants against the creator. */
export function VestingFigure({
  n,
  v,
}: {
  n: number;
  v: { pTgeBps: number; pCliff: number; pDuration: number; cCliff: number; cDuration: number } | null;
}) {
  if (!v) {
    return (
      <figure className="sd-fig">
        <div className="sd-vest empty" />
        <figcaption className="cap">
          <b>Fig. {n}.</b> Fill in both schedules to draw them.
        </figcaption>
      </figure>
    );
  }
  const pEnd = v.pCliff + v.pDuration;
  const cEnd = v.cCliff + v.cDuration;
  const T = Math.max(cEnd, pEnd, 1) * 1.08;
  const X = (t: number) => (t / T) * 100;
  const Y = (share: number) => 100 - share;
  const tge = v.pTgeBps / 100;
  const crowd = `M0 ${Y(tge)} L${X(v.pCliff)} ${Y(tge)} L${X(pEnd)} ${Y(100)} L100 ${Y(100)}`;
  const dev = `M0 ${Y(0)} L${X(v.cCliff)} ${Y(0)} L${X(cEnd)} ${Y(100)} L100 ${Y(100)}`;
  const early = v.cCliff < pEnd;
  const at = (t: number) => (t === 0 ? "at T0" : `after ${fmtDuration(t)}`);
  const ticks = [0, pEnd, v.cCliff, cEnd].filter((t, i, a) => a.indexOf(t) === i).sort((a, b) => a - b);
  return (
    <figure className="sd-fig">
      <div className="sd-vest" role="img" aria-label={`Participants unlock ${pct(v.pTgeBps)} at T0${pEnd ? ` and the rest by ${fmtDuration(pEnd)}` : ""}. The creator unlocks nothing until ${fmtDuration(v.cCliff)}, then linearly until ${fmtDuration(cEnd)}.`}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d={`${dev} L100 100 L0 100 Z`} fill="rgba(35,30,25,.06)" />
          {early ? (
            <rect x={X(v.cCliff)} y="0" width={X(pEnd) - X(v.cCliff)} height="100" fill="rgba(154,59,31,.16)" />
          ) : (
            <rect x="0" y="0" width={X(v.cCliff)} height="100" fill="rgba(199,216,59,.28)" />
          )}
          <line x1="0" x2="100" y1="100" y2="100" stroke="#231e19" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          <line x1="0" x2="100" y1="0" y2="0" stroke="rgba(35,30,25,.24)" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          <path d={crowd} fill="none" stroke="#2e4527" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <path d={dev} fill="none" stroke="#231e19" strokeWidth="2" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        <span className="y y100">100%</span>
        <span className="y y0">0%</span>
        {!early && X(v.cCliff) > 16 && (
          <span className="band" style={{ left: 0, width: `${X(v.cCliff)}%` }}>
            <em>only the crowd can sell here</em>
          </span>
        )}
        {early && X(pEnd) - X(v.cCliff) > 16 && (
          <span className="band bad" style={{ left: `${X(v.cCliff)}%`, width: `${X(pEnd) - X(v.cCliff)}%` }}>
            <em>you’d unlock before the crowd</em>
          </span>
        )}
      </div>
      <ol className="sd-vticks" aria-hidden="true">
        {ticks.map((t, i) => (
          <li key={t} className={i % 2 ? "lo" : undefined} style={{ left: `${X(t)}%` }}>
            <span>{t === 0 ? "T0" : fmtDuration(t)}</span>
          </li>
        ))}
      </ol>
      <dl className="sd-vfacts">
        <div>
          <dt>
            <i className="crowd" aria-hidden="true" />
            Participants fully unlocked
          </dt>
          <dd>{at(pEnd)}</dd>
        </div>
        <div>
          <dt>
            <i className="dev" aria-hidden="true" />
            Your cliff ends
          </dt>
          <dd>{at(v.cCliff)}</dd>
        </div>
        <div>
          <dt>
            <i className="dev" aria-hidden="true" />
            You’re fully unlocked
          </dt>
          <dd>{at(cEnd)}</dd>
        </div>
      </dl>
      <figcaption className="cap">
        <b>Fig. {n}.</b> Share unlocked since T0. Your line can only start rising once the participants’ line has reached the top.
      </figcaption>
    </figure>
  );
}

export const LEGS = [
  { key: "bid", label: "Ascend’s bid", cls: "bid" },
  { key: "stakers", label: "Stakers", cls: "stk" },
  { key: "team", label: "Team", cls: "team" },
  { key: "platform", label: "Platform", cls: "plat" },
] as const;

/** Where each 100 of creator fees goes. */
export function SplitBar({ n, split, caption }: { n?: number; split: { bid: number; stakers: number; team: number; platform: number }; caption?: string }) {
  return (
    <figure className="sd-fig">
      <div className="sd-split" aria-hidden="true">
        {LEGS.map((l) => (split[l.key] > 0 ? <span key={l.key} className={l.cls} style={{ width: `${split[l.key] / 100}%` }} /> : null))}
      </div>
      <ul className="sd-splitkey">
        {LEGS.map((l) => (
          <li key={l.key}>
            <i className={l.cls} aria-hidden="true" />
            {l.label} <b className="num">{pct(split[l.key])}</b>
          </li>
        ))}
      </ul>
      {n !== undefined && (
        <figcaption className="cap">
          <b>Fig. {n}.</b> {caption ?? "Where every 100 of creator fees goes."}
        </figcaption>
      )}
    </figure>
  );
}

/** One fee leg, read-only: its bounds as a bracket on a 0–100% rail, the current value as a knob. */
export function BoundsRail({ label, min, max, value, fixed }: { label: string; min: number; max: number; value: number; fixed?: boolean }) {
  return (
    <div className="sd-legrow">
      <span>{label}</span>
      <div className={`sd-range${fixed ? " fixed" : ""}`} aria-hidden="true">
        {!fixed && <span className="b" style={{ left: `${min / 100}%`, width: `${(max - min) / 100}%` }} />}
        <span className="k" style={{ left: `${value / 100}%` }} />
      </div>
      <span className="v num">
        {pct(value)}
        <small>{fixed ? "fixed" : `${pct(min)} to ${pct(max)}`}</small>
      </span>
    </div>
  );
}
