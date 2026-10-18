"use client";

import { useEffect, useRef, useState } from "react";
import { FOREST, Perch, WING } from "./birds";
import type { WindowsLike } from "./format";

/** The round's life as a wire: opened, lock, T0, fire by. A bird marks now. */
export function Timeline({ w, now, firedAt }: { w: WindowsLike; now: number; firedAt?: number | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(240, Math.round(el.getBoundingClientRect().width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const x0 = 6;
  const x1 = width - 6;
  const marks: [number, number, string][] = [
    [w.openAt, 0, "opened"],
    [w.lockAt, 0.58, "lock"],
    [w.closeAt, 0.78, "T0"],
    [w.fireBy, 1, "fire by"],
  ];
  // fixed stations, so lock and T0 keep their labels apart even when they are seconds apart
  const X = (t: number) => {
    if (t <= marks[0][0]) return x0;
    for (let i = 1; i < marks.length; i++) {
      if (t <= marks[i][0]) {
        const [a, fa] = marks[i - 1];
        const [b, fb] = marks[i];
        const u = b === a ? 1 : (t - a) / (b - a);
        return x0 + (fa + u * (fb - fa)) * (x1 - x0);
      }
    }
    return x1;
  };
  const at = Math.min(now, firedAt ?? now);
  const nx = X(at);
  const y = 26;
  return (
    <div className="tl" ref={ref} aria-hidden="true">
      <svg viewBox={`0 0 ${width} 58`}>
        <line x1={x0} y1={y} x2={x1} y2={y} stroke="rgba(35,30,25,.25)" strokeWidth={1.4} />
        <line x1={x0} y1={y} x2={nx} y2={y} stroke="#231e19" strokeWidth={2} />
        {marks.map(([, f, label], i) => {
          const x = x0 + f * (x1 - x0);
          return (
            <g key={label}>
              <line x1={x} y1={y - 6} x2={x} y2={y + 6} stroke="#231e19" strokeWidth={1.4} />
              <text x={x} y={y + 24} className="tl-lbl" textAnchor={i === 0 ? "start" : i === 3 ? "end" : "middle"}>
                {label}
              </text>
            </g>
          );
        })}
        <Perch x={nx} y={y + 0.5} w={12} fill={firedAt ? FOREST : WING} ring={!firedAt} />
        <text x={Math.min(Math.max(nx, 16), x1 - 16)} y={y - 18} className="tl-now" textAnchor="middle">
          {firedAt ? "fired" : "now"}
        </text>
      </svg>
    </div>
  );
}
