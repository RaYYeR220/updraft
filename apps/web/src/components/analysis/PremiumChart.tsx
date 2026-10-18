"use client";

import { type KeyboardEvent, useMemo, useState } from "react";
import { Perch } from "@/components/landing/Bird";
import { useWidth } from "@/components/landing/charts";
import { pct, short, times } from "@/components/landing/format";

export interface PremiumPoint {
  token: string;
  premium: number;
  dev: number;
}

const BINS: { lo: number; hi: number; label: [string, string] }[] = [
  { lo: 0, hi: 1.01, label: ["under", "1.01×"] },
  { lo: 1.01, hi: 1.1, label: ["1.01 to", "1.1×"] },
  { lo: 1.1, hi: 2, label: ["1.1 to", "2×"] },
  { lo: 2, hi: 5, label: ["2 to", "5×"] },
  { lo: 5, hi: 10, label: ["5 to", "10×"] },
  { lo: 10, hi: Infinity, label: ["10× and", "over"] },
];

/** Fig. 2: one bird per dev-buy launch, perched over what the next buyer paid against the dev's average. */
export function PremiumChart({ points }: { points: PremiumPoint[] }) {
  const [ref, w] = useWidth<HTMLDivElement>(1040);
  const [active, setActive] = useState<number | null>(null);

  const bins = useMemo(() => {
    const sorted = [...points].sort((a, b) => a.premium - b.premium);
    return BINS.map((b) => ({ ...b, items: sorted.filter((p) => p.premium >= b.lo && p.premium < b.hi) }));
  }, [points]);
  const flat = bins.flatMap((b) => b.items);

  const narrow = w < 640;
  const perRow = narrow ? 3 : 6;
  const cw = narrow ? 14 : 16,
    ch = narrow ? 16 : 18,
    bird = narrow ? 10.5 : 12;
  const tallest = Math.max(...bins.map((b) => Math.ceil(b.items.length / perRow)), 1);
  const top = 36,
    base = top + tallest * ch + 6,
    h = base + (narrow ? 50 : 40);
  const colW = w / bins.length;

  const birds: { x: number; y: number; p: PremiumPoint; k: number }[] = [];
  let k = 0;
  bins.forEach((b, bi) => {
    const cx = colW * bi + colW / 2;
    const rowW = Math.min(perRow, b.items.length) * cw;
    b.items.forEach((p, j) => {
      const r = Math.floor(j / perRow),
        c = j % perRow;
      birds.push({ x: cx - rowW / 2 + c * cw + cw / 2, y: base - 2 - r * ch, p, k: k++ });
    });
  });

  const keys = (e: KeyboardEvent<SVGSVGElement>) => {
    const cur = active ?? -1;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = Math.min(flat.length - 1, cur + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, cur < 0 ? 0 : cur - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = flat.length - 1;
    else if (e.key === "Escape") next = null;
    else return;
    e.preventDefault();
    setActive(next);
  };
  const a = active !== null ? birds[active] : null;
  const tipLeft = a ? Math.min(Math.max(a.x, 130), w - 130) : 0;
  const tipTop = a ? a.y - ch - 54 : 0;

  return (
    <figure className="chart premium-chart">
      <div ref={ref} className="plot">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          width={w}
          height={h}
          tabIndex={0}
          role="img"
          aria-label={`Next-buyer premium for ${flat.length} launches with a dev-buy, in bins: ${bins.map((b) => `${b.label.join(" ")}: ${b.items.length}`).join("; ")}. Use the arrow keys to read each launch.`}
          onKeyDown={keys}
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
        >
          <line x1={0} x2={w} y1={base} y2={base} stroke="#231e19" strokeWidth={1.5} />
          {bins.map((b, bi) => {
            const cx = colW * bi + colW / 2;
            const rows = Math.ceil(b.items.length / perRow);
            return (
              <g key={b.lo}>
                {bi > 0 && <line x1={colW * bi} x2={colW * bi} y1={base - 6} y2={base + 6} stroke="#6b5f4d" strokeWidth={1} />}
                <text x={cx} y={base - rows * ch - 12} fontSize={13} fontWeight={600} fill="#231e19" textAnchor="middle">
                  {b.items.length}
                </text>
                {narrow ? (
                  <text x={cx} y={base + 20} fontSize={11.5} fill="#4f463b" textAnchor="middle">
                    <tspan x={cx}>{b.label[0]}</tspan>
                    <tspan x={cx} dy={14}>
                      {b.label[1]}
                    </tspan>
                  </text>
                ) : (
                  <text x={cx} y={base + 22} fontSize={12.5} fill="#4f463b" textAnchor="middle">
                    {b.label.join(" ")}
                  </text>
                )}
              </g>
            );
          })}
          {birds.map((b) => (
            <g key={b.p.token} onPointerEnter={() => setActive(b.k)}>
              <rect x={b.x - cw / 2} y={b.y - ch + 1} width={cw} height={ch} fill="transparent" />
              <Perch
                x={b.x}
                y={b.y}
                w={bird}
                fill={b.k === active ? "#c7d83b" : "#231e19"}
                stroke={b.k === active ? "#2e4527" : undefined}
                strokeWidth={b.k === active ? 0.8 : undefined}
                flip={b.k % 5 === 2}
              />
            </g>
          ))}
        </svg>
        <div className="chart-tip" role="status" aria-live="polite" style={{ opacity: a ? 1 : 0, transform: `translate(${tipLeft}px, ${tipTop}px) translateX(-50%)` }}>
          {a && (
            <>
              next buyer paid <b>{times(a.p.premium)}</b> the dev&apos;s price
              <br />
              <span className="mono">{short(a.p.token)}</span>, dev-buy {pct(a.p.dev)} of supply
            </>
          )}
        </div>
      </div>
    </figure>
  );
}
