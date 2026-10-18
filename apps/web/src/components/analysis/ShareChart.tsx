"use client";

import { type KeyboardEvent, type PointerEvent, useMemo, useState } from "react";
import { Perch } from "@/components/landing/Bird";
import { useWidth } from "@/components/landing/charts";
import { pct, short, times, utc } from "@/components/landing/format";

export interface SharePoint {
  token: string;
  at: number;
  share: number;
  dev: number;
  premium: number | null;
}

const OVER = "#231e19";
const REST = "#a99c7f";
const THRESHOLD = 2000;

/** Fig. 1: creator-side share of supply in each launch's first window, one column per launch. */
export function ShareChart({ points, windowSeconds }: { points: SharePoint[]; windowSeconds: number }) {
  const [ref, w] = useWidth<HTMLDivElement>(1040);
  const [mode, setMode] = useState<"rank" | "time">("rank");
  const [active, setActive] = useState<number | null>(null);

  const order = useMemo(() => {
    const idx = points.map((_, i) => i);
    return mode === "rank" ? idx.sort((a, b) => points[b].share - points[a].share || points[a].at - points[b].at) : idx;
  }, [points, mode]);

  const narrow = w < 640;
  const m = { l: narrow ? 34 : 44, r: 6, t: 34, b: 38 };
  const h = narrow ? 260 : 300;
  const pw = w - m.l - m.r,
    ph = h - m.t - m.b;
  const n = order.length;
  const band = pw / n;
  const gap = band >= 5 ? 2 : band >= 3 ? 1 : 0;
  const bw = Math.max(0.6, band - gap);
  const X = (k: number) => m.l + k * band;
  const Y = (bps: number) => m.t + ph - (bps / 10_000) * ph;
  const zeros = points.filter((p) => p.share === 0).length;
  const over = points.filter((p) => p.share > THRESHOLD).length;
  const worstK = order.reduce((best, i, k) => (points[i].share > points[order[best]].share ? k : best), 0);
  const worst = points[order[worstK]];

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const k = Math.floor((e.clientX - r.left - m.l) / band);
    setActive(k >= 0 && k < n ? k : null);
  };
  const keys = (e: KeyboardEvent<SVGSVGElement>) => {
    const step = e.shiftKey ? 10 : 1;
    const cur = active ?? -1;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = Math.min(n - 1, cur + step);
    else if (e.key === "ArrowLeft") next = Math.max(0, cur < 0 ? 0 : cur - step);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else if (e.key === "Escape") next = null;
    else return;
    e.preventDefault();
    setActive(next);
  };

  const a = active !== null ? points[order[active]] : null;
  const ax = active !== null ? X(active) + bw / 2 : 0;
  const tipLeft = Math.min(Math.max(ax, 120), w - 120);
  const tipTop = a ? Math.max(-14, Y(a.share) - 84) : 0;

  return (
    <figure className="chart share-chart">
      <div className="chart-bar">
        <figcaption className="cap">
          <b>Fig. 1.</b> Share of the 1B supply the creator side bought in each launch&apos;s first {windowSeconds} seconds. One column per
          launch; dark where it passed a fifth.
        </figcaption>
        <div className="seg" role="group" aria-label="Order the columns">
          <button type="button" aria-pressed={mode === "rank"} onClick={() => (setMode("rank"), setActive(null))}>
            By share
          </button>
          <button type="button" aria-pressed={mode === "time"} onClick={() => (setMode("time"), setActive(null))}>
            In launch order
          </button>
        </div>
      </div>
      <div ref={ref} className="plot">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          width={w}
          height={h}
          tabIndex={0}
          role="img"
          aria-label={`Creator-side share of supply for ${n} launches: ${over} above 20%, ${zeros} with none. Use the arrow keys to read each launch; the table below lists every one.`}
          onPointerMove={pick}
          onPointerLeave={() => setActive(null)}
          onKeyDown={keys}
          onBlur={() => setActive(null)}
        >
          {[0, 4000, 6000, 8000, 10000].map((v) => (
            <g key={v}>
              <line x1={m.l} x2={w - m.r} y1={Y(v)} y2={Y(v)} stroke={v ? "rgba(35,30,25,.1)" : "#231e19"} strokeWidth={v ? 1 : 1.2} />
              <text x={m.l - 8} y={Y(v) + 4} fontSize={12} fill="#6b5f4d" textAnchor="end">
                {v / 100}%
              </text>
            </g>
          ))}
          {order.map((i, k) => {
            const p = points[i];
            if (p.share === 0) return null;
            const y = Y(p.share);
            return (
              <rect
                key={p.token}
                x={X(k) + gap / 2}
                y={y}
                width={bw}
                height={Math.max(0.8, Y(0) - y)}
                fill={k === active ? "#2e4527" : p.share > THRESHOLD ? OVER : REST}
              />
            );
          })}
          <line x1={m.l} x2={w - m.r} y1={Y(THRESHOLD)} y2={Y(THRESHOLD)} stroke="#2e4527" strokeWidth={1.5} />
          {!narrow && mode === "rank" && (
            <text x={w - m.r} y={Y(THRESHOLD) - 7} fontSize={12.5} fill="#2e4527" fontWeight={600} textAnchor="end">
              20%: a fifth of supply
            </text>
          )}
          <text x={m.l - 8} y={Y(THRESHOLD) + 4} fontSize={12} fill="#2e4527" fontWeight={600} textAnchor="end">
            20%
          </text>
          <Perch x={X(worstK) + bw / 2 + (worstK === 0 ? 4 : 0)} y={Y(worst.share) - 1} w={12} fill="#231e19" />
          <text x={X(worstK) + bw / 2 + 14} y={Y(worst.share) - 8} fontSize={13} fontWeight={600} fill="#231e19" textAnchor={X(worstK) > w - 160 ? "end" : "start"}>
            {pct(worst.share)}, the worst case
          </text>
          {mode === "rank" ? (
            <>
              <text className="it" x={X(over) + 10} y={Y(THRESHOLD) - 26} fontSize={narrow ? 12.5 : 14} fill="#4f463b">
                {over} launches above a fifth
              </text>
              {zeros > 0 && (
                <g>
                  <line x1={X(n - zeros) + 2} x2={X(n) - 2} y1={Y(0) - 10} y2={Y(0) - 10} stroke="#6b5f4d" strokeWidth={1} />
                  <line x1={X(n - zeros) + 2} x2={X(n - zeros) + 2} y1={Y(0) - 14} y2={Y(0) - 6} stroke="#6b5f4d" />
                  <line x1={X(n) - 2} x2={X(n) - 2} y1={Y(0) - 14} y2={Y(0) - 6} stroke="#6b5f4d" />
                  <text className="it" x={X(n) - 2} y={Y(0) - 20} fontSize={narrow ? 12.5 : 14} fill="#4f463b" textAnchor="end">
                    {zeros} with no creator-side buying
                  </text>
                </g>
              )}
              <text x={m.l} y={h - 12} fontSize={12} fill="#6b5f4d">
                highest share
              </text>
              <text x={w - m.r} y={h - 12} fontSize={12} fill="#6b5f4d" textAnchor="end">
                lowest
              </text>
            </>
          ) : (
            <>
              <text x={m.l} y={h - 12} fontSize={12} fill="#6b5f4d">
                first launch, {utc(points[0].at, false)}
              </text>
              <text x={w - m.r} y={h - 12} fontSize={12} fill="#6b5f4d" textAnchor="end">
                last, {utc(points[n - 1].at, false)}
              </text>
            </>
          )}
          {active !== null && <line x1={ax} x2={ax} y1={m.t - 6} y2={Y(0)} stroke="#2e4527" strokeWidth={1} strokeOpacity={0.5} />}
        </svg>
        <div className="chart-tip" role="status" aria-live="polite" style={{ opacity: a ? 1 : 0, transform: `translate(${tipLeft}px, ${tipTop}px) translateX(-50%)` }}>
          {a && (
            <>
              <b>{pct(a.share)}</b> to the creator side
              <br />
              <span className="mono">{short(a.token)}</span>, {utc(a.at)}
              <br />
              dev-buy {pct(a.dev)}
              {a.premium !== null ? `, next token cost ${times(a.premium)}` : ""}
            </>
          )}
        </div>
      </div>
    </figure>
  );
}
