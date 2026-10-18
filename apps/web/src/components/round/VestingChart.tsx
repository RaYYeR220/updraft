"use client";

import { useEffect, useRef, useState } from "react";
import { FOREST, INK } from "./birds";
import { type VestingLike, duration, vestedAt, when } from "./format";

export interface Schedule {
  label: string;
  v: VestingLike;
  color: string;
  /** Second series is dashed so the two never rely on colour alone. */
  dash?: boolean;
}

/** Unlocked share over time for each schedule, from T0. `now` marks the present once the round has fired. */
export function VestingChart({ start, schedules, now }: { start: number; schedules: Schedule[]; now: number | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(560);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(260, Math.round(el.getBoundingClientRect().width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const end = Math.max(60, ...schedules.map((s) => s.v.cliff + s.v.duration)) * 1.12;
  const h = 190;
  const m = { l: 44, r: 14, t: 14, b: 40 };
  const X = (t: number) => m.l + (Math.min(Math.max(t, 0), end) / end) * (w - m.l - m.r);
  const Y = (f: number) => m.t + (1 - f) * (h - m.t - m.b);
  const path = (v: VestingLike) => {
    const tge = v.tgeBps / 10_000;
    const pts: [number, number][] = [
      [0, tge],
      [v.cliff, tge],
    ];
    if (v.duration > 0) pts.push([v.cliff + v.duration, 1]);
    else pts.push([v.cliff, 1]);
    pts.push([end, 1]);
    return pts.map(([t, f], i) => `${i ? "L" : "M"}${X(t).toFixed(1)} ${Y(f).toFixed(1)}`).join(" ");
  };
  const elapsed = now === null ? null : now - start;
  const marks = Array.from(new Set(schedules.flatMap((s) => [s.v.cliff, s.v.cliff + s.v.duration]).filter((t) => t > 0))).sort((a, b) => a - b);

  const at = hover ?? (elapsed !== null && elapsed >= 0 && elapsed <= end ? elapsed : null);

  return (
    <div className="vest">
      <div className="legend" aria-hidden="true">
        {schedules.map((s) => (
          <span key={s.label}>
            <i className={`ln${s.dash ? " dash" : ""}`} style={{ color: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="vest-chart" ref={ref}>
        <svg
          viewBox={`0 0 ${w} ${h}`}
          role="img"
          aria-label={schedules.map((s) => `${s.label}: ${describe(s.v)}`).join(". ")}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - r.left) / r.width) * w;
            setHover(Math.max(0, Math.min(end, ((x - m.l) / (w - m.l - m.r)) * end)));
          }}
          onPointerLeave={() => setHover(null)}
        >
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={m.l} y1={Y(f)} x2={w - m.r} y2={Y(f)} stroke={f ? "rgba(35,30,25,.1)" : INK} strokeWidth={f ? 1 : 1.2} />
              <text className="ax" x={m.l - 8} y={Y(f) + 4} textAnchor="end">
                {f * 100}%
              </text>
            </g>
          ))}
          <text className="ax" x={m.l} y={Y(0) + 22} textAnchor="start">
            T0
          </text>
          {marks.map((t, i) => {
            const x = X(t);
            const tooClose = i > 0 && x - X(marks[i - 1]) < 70;
            return (
              <g key={t}>
                <line x1={x} y1={Y(0)} x2={x} y2={Y(0) + 5} stroke={INK} />
                {!tooClose && x - m.l > 40 && (
                  <text className="ax" x={x} y={Y(0) + 22} textAnchor={x > w - 60 ? "end" : "middle"}>
                    +{duration(t)}
                  </text>
                )}
              </g>
            );
          })}
          {schedules.map((s) => (
            <path
              key={s.label}
              d={path(s.v)}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dash ? "6 5" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {at !== null && (
            <g pointerEvents="none">
              <line x1={X(at)} y1={m.t} x2={X(at)} y2={Y(0)} stroke={INK} strokeOpacity={hover !== null ? 0.35 : 0.6} />
              {schedules.map((s) => (
                <circle key={s.label} cx={X(at)} cy={Y(vestedAt(s.v, at))} r={4} fill={s.color} stroke="#efe8d6" strokeWidth={2} />
              ))}
              {hover === null && (
                <text className="tl-now" x={Math.min(Math.max(X(at), m.l + 16), w - m.r - 16)} y={m.t - 2} textAnchor="middle">
                  now
                </text>
              )}
            </g>
          )}
        </svg>
      </div>
      <p className="vest-read" aria-live="polite">
        {at !== null
          ? `${hover !== null ? when(start + Math.round(at)) : "Now"}: ${schedules.map((s) => `${s.label.toLowerCase()} ${Math.round(vestedAt(s.v, at) * 100)}% unlocked`).join(", ")}.`
          : schedules.map((s) => `${s.label}: ${describe(s.v)}.`).join(" ")}
      </p>
    </div>
  );
}

function describe(v: VestingLike) {
  const tge = v.tgeBps / 100;
  if (tge >= 100 || (v.cliff === 0 && v.duration === 0)) return "everything unlocked at T0";
  return `${tge}% at T0, ${v.cliff ? `nothing more for ${duration(v.cliff)}, ` : ""}${v.duration ? `then linear over ${duration(v.duration)}` : "then the rest"}`;
}

export const VEST_COLORS = { creator: FOREST, participants: INK };
