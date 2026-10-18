import Link from "next/link";
import { Perch } from "./Bird";
import type { ProblemFigures } from "./data";
import { int } from "./format";

/** One bird per launch, in launch order; dark where the flag holds. */
function UnitGrid({ n, flags, fallbackOn }: { n: number; flags: boolean[] | null; fallbackOn: number }) {
  const cols = 21,
    rows = Math.ceil(n / cols),
    cw = 13.6,
    ch = 17.4;
  const w = cols * cw,
    h = rows * ch;
  return (
    <svg viewBox={`0 0 ${w} ${h + 2}`}>
      {Array.from({ length: n }, (_, i) => {
        const c = i % cols,
          r = Math.floor(i / cols),
          on = flags ? flags[i] : i < fallbackOn;
        return <Perch key={i} x={c * cw + cw / 2} y={r * ch + ch - 1} w={10.2} fill={on ? "#231e19" : "#c3b694"} flip={(i * 7 + r) % 5 === 0} />;
      })}
    </svg>
  );
}

/** The worst launch's supply split, drawn as one wire. */
function SplitWire({ share }: { share: number }) {
  const w = 300,
    x0 = 2,
    x1 = w - 2,
    y = 52,
    cut = x0 + (x1 - x0) * share;
  const birds = Math.max(1, Math.round(22 * share));
  const insider = Math.round(share * 100);
  return (
    <svg viewBox={`0 0 ${w} 92`}>
      <rect x={x0} y={y} width={Math.max(0, cut - x0 - 2)} height={9} rx={4.5} fill="#231e19" />
      <rect x={cut} y={y} width={Math.max(2, x1 - cut)} height={9} rx={2} fill="#c7d83b" stroke="#2e4527" strokeWidth={1} />
      {Array.from({ length: birds }, (_, i) => (
        <Perch key={i} x={x0 + 9 + i * ((cut - x0 - 20) / Math.max(1, birds - 1))} y={y + 0.5} w={10} fill="#231e19" flip={i % 6 === 2} />
      ))}
      <text x={x0} y={y + 32} fontSize={13} fill="#4f463b">
        creator side, {insider}%
      </text>
      <text x={x1} y={y + 32} fontSize={13} fill="#4f463b" textAnchor="end">
        everyone else, {100 - insider}%
      </text>
      <line x1={x1 - 2} y1={y + 12} x2={x1 - 2} y2={y + 19} stroke="#4f463b" />
    </svg>
  );
}

/** Perch heights drawn to scale: the dev's average price against the next buyer's. */
function PerchHeights({ premium }: { premium: number }) {
  const w = 300,
    H = 176,
    base = H,
    top = Math.max(premium, 2),
    unit = (H - 24) / top;
  const step = top > 8 ? 4 : top > 4 ? 2 : 1;
  const ticks = Array.from({ length: Math.floor(top / step) }, (_, i) => (i + 1) * step);
  const posts = [
    { x: 62, v: 1, l: "the dev's average", c: "#2e4527" },
    { x: 178, v: premium, l: "the next buyer", c: "#231e19" },
  ];
  const label = (v: number) => (v === 1 ? "1×" : `${v.toFixed(1)}×`);
  return (
    <svg viewBox={`0 0 ${w} ${H + 30}`}>
      {ticks.map((v) => {
        const yy = base - v * unit;
        return (
          <g key={v}>
            <line x1={0} y1={yy} x2={w - 26} y2={yy} stroke="rgba(35,30,25,.1)" strokeWidth={1} />
            <text x={w} y={yy + 4} fontSize={11.5} fill="#6b5f4d" textAnchor="end">
              {v}×
            </text>
          </g>
        );
      })}
      <line x1={0} y1={base} x2={w} y2={base} stroke="#231e19" strokeWidth={1.5} />
      {posts.map((p) => {
        const t = base - p.v * unit;
        return (
          <g key={p.l}>
            <line x1={p.x} y1={base} x2={p.x} y2={t} stroke="#231e19" strokeWidth={3} strokeLinecap="round" />
            <line x1={p.x - 10} y1={t} x2={p.x + 10} y2={t} stroke="#231e19" strokeWidth={2} strokeLinecap="round" />
            <Perch x={p.x + 1} y={t - 0.5} w={13} fill={p.c} flip={p.v > 2} />
            <text x={p.x} y={base + 21} fontSize={13} fill="#4f463b" textAnchor="middle">
              {p.l}
            </text>
            <text x={p.x + 16} y={t + (p.v > 2 ? 16 : -6)} fontSize={13} fontWeight={600} fill="#231e19">
              {label(p.v)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function Problem({ f }: { f: ProblemFigures }) {
  const worst = Math.round(f.worstBps / 100);
  const premium = Math.round(f.maxPremium * 10) / 10;
  const order = f.devBuy ? "in launch order" : "";
  return (
    <section className="sec" id="problem" aria-labelledby="h-problem">
      <div className="wrap">
        <div className="sec-head">
          <div className="sec-title">
            <p className="plate-no">
              <b>II</b>The early bird
            </p>
            <h2 className="h2" id="h-problem">
              On a launchpad, the bottom of the curve goes to whoever is first.
            </h2>
          </div>
          <p className="lede">
            The dev&apos;s own buy, bundled wallets, snipers in the same block. Everyone after them buys higher, often from them. We
            counted it on Ascend&apos;s testnet.
          </p>
        </div>

        <div className="plate">
          <div className="figs">
            <div className="fig">
              <div className="fig-head">
                <div className="fig-num">{f.withDevBuy}</div>
                <div>
                  <h3>launches opened with a dev-buy</h3>
                  <p className="cap">
                    Fig. 1. One bird per launch, {int(f.launches)} in all{order ? `, ${order}` : ""}. The dark ones started with the creator
                    buying first.
                  </p>
                </div>
              </div>
              <div className="art" aria-hidden="true">
                <UnitGrid n={f.launches} flags={f.devBuy} fallbackOn={f.withDevBuy} />
              </div>
            </div>
            <div className="fig">
              <div className="fig-head">
                <div className="fig-num">{f.over20}</div>
                <div>
                  <h3>launches where the creator side took more than 20% of supply at the bottom of the curve</h3>
                  <p className="cap">
                    Fig. 2. Same {int(f.launches)} launches. Dark: the creator side held over a fifth of supply from the cheapest part of the
                    curve.
                  </p>
                </div>
              </div>
              <div className="art" aria-hidden="true">
                <UnitGrid n={f.launches} flags={f.insiderOver20} fallbackOn={f.over20} />
              </div>
            </div>
            <div className="fig">
              <div className="fig-head">
                <div className="fig-num">
                  {worst}
                  <small>%</small>
                </div>
                <div>
                  <h3>of supply went to the creator side in the worst case</h3>
                  <p className="cap">Fig. 3. One wire, one launch. Everyone else shared what was left.</p>
                </div>
              </div>
              <div className="art" aria-hidden="true">
                <SplitWire share={f.worstBps / 10_000} />
              </div>
            </div>
            <div className="fig">
              <div className="fig-head">
                <div className="fig-num">
                  {premium}
                  <small>×</small>
                </div>
                <div>
                  <h3>what the next buyer paid after the biggest dev-buys, against the dev&apos;s own average price</h3>
                  <p className="cap">Fig. 4. Perch heights drawn to scale.</p>
                </div>
              </div>
              <div className="art" aria-hidden="true">
                <PerchHeights premium={f.maxPremium} />
              </div>
            </div>
          </div>
          <div className="src">
            <p className="cap">
              Source: <b>Ascend testnet, {int(f.launches)} launches up to block {int(f.block)}.</b>{" "}
              <Link className="cap-link" href="/bottom-of-curve">
                Read the full analysis
              </Link>
            </p>
            <div className="legend" aria-hidden="true">
              <span>
                <svg viewBox="0 0 12 16">
                  <use href="#perch" fill="#231e19" color="#231e19" />
                </svg>
                counted
              </span>
              <span>
                <svg viewBox="0 0 12 16">
                  <use href="#perch" fill="#b9ab8c" color="#b9ab8c" />
                </svg>
                the rest of the {int(f.launches)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
