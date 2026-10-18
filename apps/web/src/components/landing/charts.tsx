"use client";

import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flyPath } from "./birds";

const useIsoLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The element's width in CSS pixels, so a chart can draw at its real size and keep text at true size. */
export function useWidth<T extends HTMLElement>(fallback: number): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useIsoLayout(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(Math.max(280, Math.round(el.getBoundingClientRect().width)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Nothing unlocks until the cliff, then a straight line. Example schedule. */
export function VestChart() {
  const [ref, w] = useWidth<HTMLDivElement>(560);
  const h = 140;
  const X = (d: number) => 40 + (d / 120) * (w - 50),
    Y = (p: number) => h - p * (h - 14);
  const td = 54,
    tp = (td - 30) / 90;
  return (
    <div ref={ref} className="art">
      <svg
        viewBox={`0 0 ${w} ${h + 28}`}
        role="img"
        aria-label="Example: nothing unlocks for 30 days, then the dev's share unlocks in a straight line until day 120."
      >
        {[0, 0.5, 1].map((p) => (
          <g key={p}>
            <line x1={40} y1={Y(p)} x2={w - 10} y2={Y(p)} stroke={p ? "rgba(35,30,25,.1)" : "#231e19"} strokeWidth={p ? 1 : 1.2} />
            <text x={30} y={Y(p) + 4} fontSize={12} fill="#6b5f4d" textAnchor="end">
              {p * 100}%
            </text>
          </g>
        ))}
        <path d={`M${X(0)} ${Y(0)} L${X(30)} ${Y(0)} L${X(120)} ${Y(1)} L${X(120)} ${Y(0)} Z`} fill="rgba(46,69,39,.1)" />
        <path
          d={`M${X(0)} ${Y(0)} L${X(30)} ${Y(0)} L${X(120)} ${Y(1)}`}
          fill="none"
          stroke="#2e4527"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <line x1={X(td)} y1={Y(0)} x2={X(td)} y2={Y(tp)} stroke="#231e19" strokeWidth={1} />
        <circle cx={X(td)} cy={Y(tp)} r={5} fill="#c7d83b" stroke="#2e4527" strokeWidth={1.5} />
        <text x={X(td) + 12} y={Y(tp) + 20} fontSize={13} fill="#231e19" fontWeight={600}>
          {w < 420 ? "day 54: 26.7%" : "day 54: 26.7% unlocked"}
        </text>
        {(
          [
            [0, "T0"],
            [30, "cliff, day 30"],
            [120, "day 120"],
          ] as const
        ).map(([d, l]) => (
          <text key={d} x={X(d)} y={h + 22} fontSize={12} fill="#6b5f4d" textAnchor={d === 0 ? "start" : d === 120 ? "end" : "middle"}>
            {l}
          </text>
        ))}
      </svg>
    </div>
  );
}

/** The current split, and a change waiting out its timelock. Example policy. */
export function PolicyChart() {
  const [ref, w] = useWidth<HTMLDivElement>(560);
  const legs: [string, number, string, string][] = [
    ["Ascend's bid", 30, "#2e4527", "#ece6cf"],
    ["Stakers", 30, "#c7d83b", "#231e19"],
    ["Team", 30, "#6b5f4d", "#efe8d6"],
    ["Platform", 10, "#b9ab8c", "#231e19"],
  ];
  let x = 0;
  const segs = legs.map(([n, v, c, tc], i) => {
    const last = i === legs.length - 1,
      wd = (v / 100) * w - (last ? 0 : 2);
    const seg = { n, v, c, tc, x, wd, last };
    x += wd + 2;
    return seg;
  });
  const ty = 100,
    tx0 = 6,
    tx1 = Math.min(380, w - 40);
  return (
    <div ref={ref} className="art">
      <svg
        viewBox={`0 0 ${w} 132`}
        role="img"
        aria-label="Example policy: Ascend's bid 30%, stakers 30%, team 30%, platform 10%. A change inside the bounds is queued in public and applies after a 72-hour timelock."
      >
        {segs.map((s) => (
          <g key={s.n}>
            <rect x={s.x} y={22} width={s.wd} height={32} rx={4} fill={s.c} />
            <text x={s.x + (s.last ? s.wd / 2 : 10)} y={43} fontSize={13} fontWeight={600} fill={s.tc} textAnchor={s.last ? "middle" : "start"}>
              {s.v}%
            </text>
            <text x={s.last ? s.x + s.wd : s.x} y={13} fontSize={12.5} fill="#4f463b" textAnchor={s.last ? "end" : "start"}>
              {s.n}
            </text>
          </g>
        ))}
        <line x1={tx0} y1={ty} x2={tx1} y2={ty} stroke="#231e19" strokeWidth={1.5} />
        {Array.from({ length: 5 }, (_, i) => {
          const xx = tx0 + ((tx1 - tx0) * (i + 1)) / 6;
          return <line key={i} x1={xx} y1={ty - 4} x2={xx} y2={ty + 4} stroke="#6b5f4d" strokeWidth={1} />;
        })}
        <circle cx={tx0} cy={ty} r={5} fill="#efe8d6" stroke="#231e19" strokeWidth={1.5} />
        <circle cx={tx1} cy={ty} r={5} fill="#c7d83b" stroke="#2e4527" strokeWidth={1.5} />
        <text x={tx0} y={ty + 24} fontSize={12.5} fill="#4f463b">
          change queued, in public
        </text>
        <text x={tx1} y={ty + 24} fontSize={12.5} fill="#4f463b" textAnchor="middle">
          applies
        </text>
        <text className="it" x={(tx0 + tx1) / 2} y={ty - 12} fontSize={15} fill="#231e19" textAnchor="middle">
          72 hours
        </text>
      </svg>
    </div>
  );
}

/** Of every batch, 99% is the fee-free launch buy and 1% funds Ascend's own bid. */
export function ParityChart() {
  const [ref, w] = useWidth<HTMLDivElement>(520);
  const cut = w * 0.99;
  return (
    <div ref={ref} className="art">
      <svg viewBox={`0 0 ${w} 78`} role="img" aria-label="Of every batch, 99% is the fee-free launch buy and 1% funds Ascend's bid.">
        <rect x={0} y={18} width={cut - 2} height={28} rx={4} fill="#2e4527" />
        <rect x={cut} y={18} width={w - cut} height={28} rx={2} fill="#c7d83b" stroke="#2e4527" strokeWidth={1} />
        <text x={12} y={36.5} fontSize={13} fontWeight={600} fill="#ece6cf">
          99%: the fee-free launch buy
        </text>
        <text x={w} y={70} fontSize={13} fill="#231e19" textAnchor="end">
          1%: Ascend&apos;s own bid
        </text>
        <line x1={w - 3} y1={48} x2={w - 3} y2={56} stroke="#231e19" />
        <text x={0} y={11} fontSize={12.5} fill="#4f463b">
          Every batch
        </text>
      </svg>
    </div>
  );
}

/** Ascend's lifecycle, with one bird flying the route once when it scrolls into view. */
export function RouteChart() {
  const [ref, w] = useWidth<HTMLDivElement>(520);
  const pathRef = useRef<SVGPathElement>(null);
  const [bird, setBird] = useState<{ u: number; flap: number }>({ u: 0.32, flap: 0.9 });
  const [pt, setPt] = useState<{ x: number; y: number; a: number } | null>(null);
  const h = 168,
    k = w / 520;
  const pts = (
    [
      [22, 136],
      [184, 106],
      [346, 70],
      [498, 34],
    ] as const
  ).map(([x, y]) => [x * k, y] as const);
  const d = `M${pts[0][0]} ${pts[0][1]} C ${90 * k} 146, ${124 * k} 102, ${pts[1][0]} ${pts[1][1]} S ${290 * k} 82, ${pts[2][0]} ${pts[2][1]} S ${452 * k} 44, ${pts[3][0]} ${pts[3][1]}`;
  const lab: [string, number, number, "start" | "middle" | "end"][] = [
    ["Launch", 0, 30, "start"],
    ["Ascended", 0, 30, "middle"],
    ["HyperCore spot", -10, -16, "end"],
    ["HIP-3", 6, -18, "end"],
  ];

  useEffect(() => {
    const p = pathRef.current;
    if (!p) return;
    const len = p.getTotalLength();
    const a = p.getPointAtLength(bird.u * len),
      b = p.getPointAtLength(Math.min(len, bird.u * len + 2));
    setPt({ x: a.x, y: a.y, a: Math.atan2(b.y - a.y, b.x - a.x) * 0.6 });
  }, [bird, w]);

  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (!e.isIntersecting) return;
          io.disconnect();
          const t0 = performance.now();
          let ph = 0;
          const step = (now: number) => {
            const u = Math.min(1, (now - t0) / 8000),
              e2 = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
            ph += 0.32;
            setBird({ u: 0.03 + 0.92 * e2, flap: u < 1 ? 0.24 + 0.84 * Math.sin(ph) : 0.9 });
            if (u < 1) raf = requestAnimationFrame(step);
          };
          raf = requestAnimationFrame(step);
        }),
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [ref]);

  return (
    <div ref={ref} className="art">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Ascend's lifecycle: Launch, Ascended, HyperCore spot, HIP-3.">
        <path d={d} fill="none" stroke="#2e4527" strokeWidth={1.5} strokeDasharray="2 6" strokeLinecap="round" />
        {pts.map(([x, y], i) => {
          const [l, ox, oy, an] = lab[i];
          return (
            <g key={l}>
              <circle cx={x} cy={y} r={i === 0 ? 7.5 : 6} fill={i === 0 ? "#c7d83b" : "#efe8d6"} stroke="#2e4527" strokeWidth={1.6} />
              <text x={x + ox} y={y + oy} fontSize={14} fontWeight={600} fill="#231e19" textAnchor={an}>
                {l}
              </text>
            </g>
          );
        })}
        <path ref={pathRef} d={d} fill="none" stroke="none" />
        {pt && <path d={flyPath(pt.x, pt.y - 18, pt.a, 7, bird.flap)} fill="#231e19" />}
      </svg>
    </div>
  );
}
