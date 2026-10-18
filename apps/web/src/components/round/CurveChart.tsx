"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FOREST, INK, Perch, WING } from "./birds";
import { compact, price, usdc } from "./format";
import type { Batch, CurvePoint } from "./hooks";

export interface TradeMark {
  /** Tokens sold on the curve when the trade landed. */
  at: number;
  /** What the trader paid per token, fees included. */
  paid: number;
  label: string;
}

function niceStep(range: number, count: number) {
  const raw = range / Math.max(1, count);
  const k = 10 ** Math.floor(Math.log10(raw));
  const f = raw / k;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * k;
}

function ticks(max: number, count: number) {
  const step = niceStep(max, count);
  const top = Math.ceil(max / step - 1e-9) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step * 1e-6; v += step) out.push(v);
  return { step, top, out };
}

function priceTick(v: number, step: number) {
  if (v === 0) return "0";
  const e = Math.floor(Math.log10(step));
  const half = Math.abs(step / 10 ** e - 2.5) < 1e-9;
  return `$${v.toFixed(Math.min(12, Math.max(0, -e + (half ? 1 : 0))))}`;
}

/** Linear read of the sampled curve at `tokens` sold: price and quote spent. */
function readAt(curve: CurvePoint[], tokens: number) {
  if (!curve.length) return { price: 0, q: 0 };
  if (tokens <= curve[0].tokens) return { price: curve[0].price, q: curve[0].q };
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if (tokens <= b.tokens) {
      const u = b.tokens === a.tokens ? 0 : (tokens - a.tokens) / (b.tokens - a.tokens);
      return { price: a.price + u * (b.price - a.price), q: a.q + u * (b.q - a.q) };
    }
  }
  const last = curve[curve.length - 1];
  return { price: last.price, q: last.q };
}

export function CurveChart({
  curve,
  batch,
  symbol,
  fired,
  trades = [],
  updating,
  youOnWire,
}: {
  curve: CurvePoint[];
  batch: Batch | undefined;
  symbol: string;
  fired: boolean;
  trades?: TradeMark[];
  updating: boolean;
  youOnWire: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 720, h: 380 });
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const descId = useId();

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setBox({ w: Math.max(280, Math.round(r.width)), h: Math.round(r.height) || 380 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [table]);

  const geo = useMemo(() => {
    const { w, h } = box;
    const narrow = w < 560;
    const m = { l: narrow ? 58 : 70, r: 16, t: 16, b: 42 };
    const xMax = curve.length ? curve[curve.length - 1].tokens : 1;
    const peak = Math.max(
      curve.length ? curve[curve.length - 1].price : 0,
      batch?.avg ?? 0,
      ...trades.filter((t) => t.at <= xMax * 1.02).map((t) => t.paid),
    );
    const yt = ticks(peak * 1.06 || 1e-6, narrow ? 4 : 5);
    const xt = ticks(xMax, narrow ? 3 : 4);
    const X = (t: number) => m.l + (Math.min(t, xMax) / xMax) * (w - m.l - m.r);
    const Y = (p: number) => m.t + (1 - p / yt.top) * (h - m.t - m.b);
    return { w, h, m, narrow, xMax, yt, xt, X, Y };
  }, [box, curve, batch, trades]);

  const { w, h, m, narrow, xMax, yt, xt, X, Y } = geo;
  const curveD = curve.map((p, i) => `${i ? "L" : "M"}${X(p.tokens).toFixed(1)} ${Y(p.price).toFixed(1)}`).join(" ");

  const inBatch = batch && batch.tokensOut > 0;
  const bx = inBatch ? Math.min(batch.tokensOut, xMax) : 0;
  let areaD = "";
  if (inBatch && curve.length) {
    areaD = `M${X(0)} ${Y(0)}`;
    for (const p of curve) if (p.tokens < bx) areaD += ` L${X(p.tokens).toFixed(1)} ${Y(p.price).toFixed(1)}`;
    const end = batch.tokensOut <= xMax ? batch.next : readAt(curve, bx).price;
    areaD += ` L${X(bx).toFixed(1)} ${Y(end).toFixed(1)} L${X(bx).toFixed(1)} ${Y(0)} Z`;
  }

  const avgY = inBatch ? Y(batch.avg) : 0;
  const wireBirds = inBatch ? Math.max(0, Math.min(40, Math.floor((X(bx) - X(0) - 10) / 15))) : 0;
  const youAt = youOnWire ? Math.floor(wireBirds * 0.55) : -1;
  const lift = inBatch && batch.avg > 0 ? Math.round((batch.next / batch.avg - 1) * 100) : 0;
  const spot = inBatch && !narrow && batch.tokensOut <= xMax ? nextSpot(X(bx), Y(batch.next), w, m, Y(0)) : null;
  const labelled = !!spot;

  // hover and keyboard readout
  const readout = hover === null ? null : { t: hover, ...readAt(curve, hover) };
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * w;
    setHover(Math.max(0, Math.min(xMax, ((x - m.l) / (w - m.l - m.r)) * xMax)));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!curve.length) return;
    const stepT = xMax / 48;
    const cur = hover ?? (inBatch ? bx : 0);
    let next: number | null = null;
    if (e.key === "ArrowRight") next = Math.min(xMax, cur + stepT);
    else if (e.key === "ArrowLeft") next = Math.max(0, cur - stepT);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = xMax;
    else if (e.key === "Escape") return setHover(null);
    if (next !== null) {
      e.preventDefault();
      setHover(next);
    }
  };

  const summary = inBatch
    ? `Ascend's launch curve for this round. The batch ${fired ? "bought" : "would buy"} ${compact(batch.tokensOut)} ${symbol} at an average of ${price(batch.avg)} a token; the curve price right after it is ${price(batch.next)}.`
    : "Ascend's launch curve for this round. No commits yet, so there is no batch on it.";

  const rows = curve.filter((_, i) => i % 4 === 0 || i === curve.length - 1);

  return (
    <div className={`chart-wrap${updating ? " updating" : ""}`}>
      <div className="legend" aria-hidden={table}>
        <span>
          <i className="ln" />
          Ascend's curve
        </span>
        <span>
          <i className="ar" />
          {fired ? "The batch: one buy at T0" : "This batch: one buy at T0"}
        </span>
        <span>
          <i className="ln f" />
          Everyone's price
        </span>
        <span>
          <i className="dt" />
          The next buyer
        </span>
        {trades.length > 0 && (
          <span>
            <i className="dt s" />
            Trades after the fire
          </span>
        )}
        <button type="button" className="view-toggle" aria-pressed={table} onClick={() => setTable((t) => !t)}>
          {table ? "Chart view" : "Table view"}
        </button>
      </div>

      {table ? (
        <div className="curve-table" tabIndex={0} role="region" aria-label="Ascend's curve as a table">
          <table>
            <caption className="sr">Sampled points of Ascend's launch curve for this round</caption>
            <thead>
              <tr>
                <th scope="col">USDC into the curve</th>
                <th scope="col">{symbol} sold</th>
                <th scope="col">Price after</th>
                <th scope="col" className="sr">
                  Note
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.q} className={inBatch && p.tokens <= bx ? "in" : undefined}>
                  <td>{usdc(BigInt(Math.round(p.q * 1e6)))}</td>
                  <td>{compact(p.tokens)}</td>
                  <td>{price(p.price)}</td>
                  <td>{inBatch && p.tokens <= bx ? "inside the batch" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className="chart"
          ref={boxRef}
          tabIndex={0}
          role="group"
          aria-roledescription="chart"
          aria-label="Ascend's curve. Use the left and right arrow keys to read prices along it."
          aria-describedby={descId}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
        >
          <p id={descId} className="sr">
            {summary}
          </p>
          <svg viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
            {yt.out.map((v) => (
              <g key={v}>
                <line x1={m.l} y1={Y(v)} x2={w - m.r} y2={Y(v)} stroke={v ? "rgba(35,30,25,.1)" : INK} strokeWidth={v ? 1 : 1.2} />
                <text className="ax" x={m.l - 10} y={Y(v) + 4} textAnchor="end">
                  {priceTick(v, yt.step)}
                </text>
              </g>
            ))}
            {xt.out
              .filter((v) => v <= xMax * 1.0001)
              .map((v) => (
                <g key={v}>
                  {v > 0 && <line x1={X(v)} y1={Y(0)} x2={X(v)} y2={Y(0) + 5} stroke={INK} />}
                  <text className="ax" x={X(v)} y={Y(0) + 22} textAnchor={v ? "middle" : "start"}>
                    {v ? compact(v) : "0"}
                  </text>
                </g>
              ))}
            <text className="ax" x={w - m.r} y={h - 2} textAnchor="end">
              {symbol} sold
            </text>

            <g className="batch-layer">
              {areaD && <path d={areaD} fill="rgba(199,216,59,.55)" />}
              {inBatch && <line x1={X(bx)} y1={Y(0)} x2={X(bx)} y2={Y(batch.next)} stroke={FOREST} strokeWidth={1} />}
            </g>
            <path d={curveD} fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

            {inBatch && (
              <g className="batch-layer">
                <line x1={X(0)} y1={avgY} x2={X(bx)} y2={avgY} stroke={FOREST} strokeWidth={2} />
                {Array.from({ length: wireBirds }, (_, i) => (
                  <Perch
                    key={i}
                    x={X(0) + 8 + i * 15}
                    y={avgY - 0.5}
                    w={9}
                    fill={i === youAt ? WING : INK}
                    ring={i === youAt}
                    flip={i % 4 === 2}
                  />
                ))}
                {narrow ? (
                  <>
                    <text className="lbl" x={X(0) + 6} y={avgY - 38}>
                      Everyone's price
                    </text>
                    <text className="lbl strong" x={X(0) + 6} y={avgY - 22}>
                      {price(batch.avg)}
                    </text>
                  </>
                ) : (
                  <text className="lbl strong" x={X(0) + 6} y={avgY - 22}>
                    Everyone's price {price(batch.avg)}
                  </text>
                )}
                {batch.tokensOut <= xMax && (
                  <NextBuyer x={X(bx)} y={Y(batch.next)} next={batch.next} lift={lift} spot={spot} />
                )}
              </g>
            )}

            {trades
              .filter((t) => t.at <= xMax)
              .map((t, i) => {
                const tx = X(t.at);
                const ty = Y(t.paid);
                const left = tx > w * 0.6;
                return (
                  <g key={i}>
                    <circle cx={tx} cy={ty} r={5} fill="#9a3b1f" stroke="#efe8d6" strokeWidth={2} />
                    {i === 0 && !narrow && (
                      <>
                        <text className="lbl strong" x={tx + (left ? -12 : 12)} y={ty - 4} textAnchor={left ? "end" : "start"}>
                          {t.label}
                        </text>
                        <text className="lbl" x={tx + (left ? -12 : 12)} y={ty + 13} textAnchor={left ? "end" : "start"}>
                          paid {price(t.paid)} a token, fee included
                        </text>
                      </>
                    )}
                  </g>
                );
              })}

            {readout && (
              <g pointerEvents="none">
                <line x1={X(readout.t)} y1={m.t} x2={X(readout.t)} y2={Y(0)} stroke={INK} strokeOpacity={0.35} />
                <circle cx={X(readout.t)} cy={Y(readout.price)} r={4.5} fill={INK} stroke="#efe8d6" strokeWidth={2} />
              </g>
            )}
            <rect
              x={m.l}
              y={m.t}
              width={Math.max(0, w - m.l - m.r)}
              height={Math.max(0, Y(0) - m.t)}
              fill="transparent"
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
            />
          </svg>
          {readout && (
            <div
              className="ctip"
              style={{ left: Math.max(4, Math.min(w - 200, X(readout.t) + 12)), top: Math.max(0, Y(readout.price) - 70) }}
            >
              <b>{price(readout.price)}</b> a token
              <br />
              {compact(readout.t)} {symbol} sold, {usdc(BigInt(Math.round(readout.q * 1e6)))} USDC in
              {inBatch && readout.t <= bx && (
                <>
                  <br />
                  inside the batch
                </>
              )}
            </div>
          )}
          <p className="sr" aria-live="polite">
            {readout ? `${compact(readout.t)} ${symbol} sold: ${price(readout.price)} a token${inBatch && readout.t <= bx ? ", inside the batch" : ""}.` : ""}
          </p>
        </div>
      )}
      {inBatch && (
        <p className={`next-note${labelled ? "" : " show"}`}>
          <b>The next buyer</b>, one block later, pays at least <b>{price(batch.next)}</b> a token ({lift >= 0 ? "+" : ""}
          {lift}% on everyone's price), plus Ascend's launch fee while it lasts.
        </p>
      )}
    </div>
  );
}

interface Spot {
  lx: number;
  ly: number;
  anchor: "start" | "end";
  lead: [number, number, number, number];
}

/** Where the next-buyer note fits: below-right of the marker, under the rising curve, or above-left of it. */
function nextSpot(x: number, y: number, w: number, m: { l: number; r: number; t: number; b: number }, baseY: number): Spot | null {
  const lx = x + 34;
  const ly = Math.min(y + 44, baseY - 50);
  if (lx + 250 <= w - m.r && ly >= y + 16) return { lx, ly, anchor: "start", lead: [x + 4, y + 4, lx - 6, ly - 12] };
  const rx = x - 16;
  const ty = y - 66;
  if (rx - 250 >= m.l + 8 && ty - 12 >= m.t) return { lx: rx, ly: ty, anchor: "end", lead: [x - 4, y - 4, rx + 2, ty + 42] };
  return null;
}

function NextBuyer({ x, y, next, lift, spot }: { x: number; y: number; next: number; lift: number; spot: Spot | null }) {
  return (
    <>
      {spot && <path d={`M${spot.lead[0]} ${spot.lead[1]} L${spot.lead[2]} ${spot.lead[3]}`} stroke="#4f463b" strokeWidth={1} fill="none" />}
      <circle cx={x} cy={y} r={5} fill="#efe8d6" stroke={INK} strokeWidth={2} />
      {spot && (
        <>
          <text className="lbl" x={spot.lx} y={spot.ly} textAnchor={spot.anchor}>
            A buyer one block later pays at least
          </text>
          <text className="lbl strong" x={spot.lx} y={spot.ly + 18} textAnchor={spot.anchor}>
            {price(next)} a token, {lift >= 0 ? "+" : ""}
            {lift}%,
          </text>
          <text className="lbl" x={spot.lx} y={spot.ly + 36} textAnchor={spot.anchor}>
            plus Ascend's launch fee while it lasts
          </text>
        </>
      )}
    </>
  );
}
