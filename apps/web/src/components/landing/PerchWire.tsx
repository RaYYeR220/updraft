"use client";

import { Perch } from "./Bird";
import { useWidth } from "./charts";

const PERCHED = [0.14, 0.153, 0.166, 0.19, 0.42, 0.434, 0.68, 0.693, 0.706, 0.719, 0.87];

/** The last wire across the top of the footer, a few birds still on it. */
export function PerchWire() {
  const [ref, w] = useWidth<HTMLDivElement>(1440);
  const narrow = w < 820;
  const h = narrow ? 90 : 120,
    y0 = h * 0.62,
    sag = Math.min(18, w * 0.012);
  const Y = (x: number) => {
    const u = (x / w) * 2 - 1;
    return y0 + sag * (1 - u * u);
  };
  return (
    <div ref={ref} className="perch" aria-hidden="true">
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
        <rect x={0} y={0} width={w} height={h} fill="#efe8d6" />
        <path d={`M0 ${h} L0 ${y0} Q ${w / 2} ${y0 + sag * 2} ${w} ${y0} L${w} ${h} Z`} fill="#253a20" />
        <path d={`M0 ${y0 - 7} Q ${w / 2} ${y0 + sag * 2 - 7} ${w} ${y0 - 7}`} fill="none" stroke="#231e19" strokeWidth={1.3} />
        {PERCHED.map((f, i) => {
          const x = f * w;
          return <Perch key={f} x={x} y={Y(x) - 7 + 0.6} w={w < 600 ? 10 : 13} fill={i === 6 ? "#c7d83b" : "#231e19"} flip={i % 3 === 1} />;
        })}
      </svg>
    </div>
  );
}
