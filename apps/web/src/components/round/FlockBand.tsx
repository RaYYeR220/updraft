"use client";

import { useEffect, useRef, useState } from "react";
import { FOREST, INK, Perch, WING, flyBird, mulberry } from "./birds";
import { short, usdc } from "./format";

export interface FlockBird {
  wallet: string;
  amount: bigint;
  you: boolean;
  dev: boolean;
  verified: boolean;
}

interface Body {
  c: FlockBird;
  lx: number;
  ly: number;
  lz: number;
  lag: number;
  nx: number;
  ny: number;
  ph: number;
  gph: number;
  hz: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  z: number;
  ang: number;
  us: number;
  turn: number;
  phi: number;
  k: number;
}

const SHADES = ["#231e19", "#2b251f", "#373028", "#463e34", "#584f43", "#6d6353", "#837865"];

function seedOf(wallet: string) {
  let h = 0;
  for (let i = 2; i < wallet.length; i++) h = (Math.imul(h, 31) + wallet.charCodeAt(i)) | 0;
  return h;
}

function makeBody(c: FlockBird): Body {
  const r = mulberry(seedOf(c.wallet));
  let lx: number;
  let ly: number;
  let lz: number;
  do {
    lx = r() * 2 - 1;
    ly = r() * 2 - 1;
    lz = r() * 2 - 1;
  } while (lx * lx + ly * ly + lz * lz > 1);
  const k = 0.42 + 0.58 * r() ** 0.8;
  return {
    c,
    lx: lx * k,
    ly: ly * 0.14 * k,
    lz: lz * 0.9 * k,
    lag: (lx + 1) * 0.5 * 0.9 + r() * 0.1,
    nx: r() * 6.28,
    ny: r() * 6.28,
    ph: r() * 6.28,
    gph: r() * 6.28,
    hz: 3.6 + r() * 1.4,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    z: 0,
    ang: Math.PI,
    us: -1,
    turn: 0,
    phi: 0.3,
    k: 1,
  };
}

function describe(c: FlockBird) {
  const who = c.you ? "You" : c.dev ? "The creator" : short(c.wallet);
  return `${who}, ${usdc(c.amount)} USDC${c.verified ? ", verified Hyperliquid account" : ""}`;
}

/** The committers as a flock: wheeling before T0, perched on one wire after it. */
export function FlockBand({ birds, landed, caption }: { birds: FlockBird[]; landed: boolean; caption: React.ReactNode }) {
  const bandRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bodies = useRef<Body[]>([]);
  const api = useRef<{ redraw: () => void; size: { W: number; H: number } } | null>(null);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);

  // keep the bodies in step with the committers, new ones flying in from the right
  useEffect(() => {
    const byWallet = new Map(bodies.current.map((b) => [b.c.wallet, b]));
    const next: Body[] = [];
    for (const c of birds) {
      const known = byWallet.get(c.wallet);
      if (known) {
        known.c = c;
        next.push(known);
      } else {
        const b = makeBody(c);
        const sz = api.current?.size;
        if (sz && bodies.current.length) {
          b.x = sz.W + 20;
          b.y = sz.H * 0.4;
          b.vx = -220;
          b.k = 0;
        } else {
          b.k = 1;
          b.x = -1;
        }
        next.push(b);
      }
    }
    bodies.current = next;
    api.current?.redraw();
  }, [birds]);

  useEffect(() => {
    if (landed) return;
    const band = bandRef.current;
    const cv = canvasRef.current;
    if (!band || !cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0;
    let H = 0;
    let dpr = 1;
    let t = 0;
    let last = 0;
    let running = false;
    let raf = 0;

    const size = () => {
      const r = band.getBoundingClientRect();
      W = r.width;
      H = r.height;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      if (api.current) api.current.size = { W, H };
    };

    const form = (b: Body, tt: number, o: { x: number; y: number; z: number }) => {
      const td = tt - b.lag;
      const S = Math.min(W * 0.2, 230);
      const cx = W * 0.5 + Math.sin(td * 0.17 - 0.45) * W * 0.24 + Math.sin(td * 0.41) * W * 0.04;
      const cy = H * 0.44 + Math.sin(td * 0.31) * H * 0.08;
      const st = 1 + 0.4 * Math.sin(td * 0.37 + 0.6);
      const z = b.lz;
      const x = b.lx * st;
      const y = b.ly / Math.sqrt(st) + 0.2 * Math.sin(b.lx * 2.1 - td * 0.95) + 0.16 * Math.sin(b.lz * 2.5 + td * 0.7);
      const roll = 0.16 * Math.sin(td * 0.17 + 0.3);
      const yaw = 1.0 * Math.sin(td * 0.19) + 0.4 * Math.sin(td * 0.43 + 2.1);
      const pitch = 0.6 * Math.sin(td * 0.23 + 1);
      let c = Math.cos(roll);
      let s = Math.sin(roll);
      const x1 = x * c - y * s;
      const y1 = x * s + y * c;
      c = Math.cos(yaw);
      s = Math.sin(yaw);
      const x2 = x1 * c + z * s;
      const z2 = -x1 * s + z * c;
      c = Math.cos(pitch);
      s = Math.sin(pitch);
      const y3 = y1 * c - z2 * s;
      const z3 = y1 * s + z2 * c;
      const p = 1 / (1 + z3 * 0.32);
      o.x = cx + x2 * S * 1.25 * p + Math.sin(tt * 1.3 + b.nx) * 3;
      o.y = cy + y3 * Math.min(S, H * 0.5) * p + Math.sin(tt * 1.7 + b.ny) * 2.4;
      o.z = z3;
    };

    const A = { x: 0, y: 0, z: 0 };
    const B = { x: 0, y: 0, z: 0 };
    const step = (dt: number) => {
      t += dt;
      for (const b of bodies.current) {
        if (b.x === -1) {
          form(b, t, b);
          b.vx = -60;
        }
        form(b, t, A);
        form(b, t - 1 / 60, B);
        const tvx = (A.x - B.x) * 60;
        const tvy = (A.y - B.y) * 60;
        b.k = Math.min(1, b.k + dt * 0.4);
        const w = 0.6 + 2.6 * b.k * b.k;
        b.vx += ((A.x - b.x) * w * w - 2 * w * (b.vx - tvx)) * dt;
        b.vy += ((A.y - b.y) * w * w - 2 * w * (b.vy - tvy)) * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += (A.z - b.z) * Math.min(1, dt * 4);
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 10) {
          const a = Math.atan2(b.vy * 0.5, b.vx);
          let d = a - b.ang;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          const st = d * Math.min(1, dt * 7);
          b.ang += st;
          b.turn += (st / Math.max(dt, 1e-3) - b.turn) * Math.min(1, dt * 5);
          const ca = Math.cos(b.ang);
          if (ca > 0.2) b.us = 1;
          else if (ca < -0.2) b.us = -1;
        }
        const gl = Math.sin(t * 0.8 + b.gph) > 0.5;
        b.ph += dt * 6.283 * b.hz * (gl ? 0 : 1);
        const tg = gl ? 0.14 : 0.24 + 0.84 * Math.sin(b.ph);
        b.phi += (tg - b.phi) * Math.min(1, dt * (gl ? 6 : 22));
      }
    };

    const maxAmount = () => bodies.current.reduce((m, b) => (b.c.amount > m ? b.c.amount : m), 1n);
    const draw = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const top = Number(maxAmount());
      const few = bodies.current.length < 12;
      const ordered = [...bodies.current].sort((p, q) => q.z - p.z);
      for (const b of ordered) {
        const d = Math.max(0, Math.min(6, Math.round(((b.z + 0.75) / 1.5) * 6)));
        const p = 1 / (1 + b.z * 0.32);
        const rel = Math.sqrt(Math.min(1, Number(b.c.amount) / top));
        const s = (W < 600 ? 3.3 : 4.2) * (few ? 1.5 : 1) * (0.85 + 0.45 * rel) * p * (b.c.you ? 1.25 : 1);
        ctx.beginPath();
        flyBird(ctx, b.x, b.y, b.ang, s, b.phi, Math.max(-0.6, Math.min(0.6, b.turn * 0.22)), b.us);
        ctx.fillStyle = b.c.you ? WING : b.c.dev ? FOREST : SHADES[d];
        ctx.fill();
        if (b.c.you) {
          ctx.lineWidth = 0.9;
          ctx.strokeStyle = FOREST;
          ctx.stroke();
        }
      }
    };

    const settle = () => {
      t = 4;
      for (const b of bodies.current) form(b, 4, b);
      draw();
    };
    const frame = (now: number) => {
      if (!running) return;
      const dt = Math.min(1 / 24, (now - last) / 1000);
      last = now;
      step(dt);
      draw();
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (running || reduce) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    api.current = { redraw: () => (reduce ? settle() : undefined), size: { W, H } };
    size();
    if (reduce) settle();
    const io = new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? start() : stop())));
    io.observe(band);
    const ro = new ResizeObserver(() => {
      size();
      if (reduce) settle();
    });
    ro.observe(band);

    const move = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      let best: Body | null = null;
      let bd = 196;
      for (const b of bodies.current) {
        const d = (b.x - mx) ** 2 + (b.y - my) ** 2;
        if (d < bd) {
          bd = d;
          best = b;
        }
      }
      setTip(best ? { text: describe(best.c), x: Math.min(window.innerWidth - 290, e.clientX + 16), y: e.clientY - 52 } : null);
    };
    const leave = () => setTip(null);
    band.addEventListener("pointermove", move);
    band.addEventListener("pointerleave", leave);
    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      band.removeEventListener("pointermove", move);
      band.removeEventListener("pointerleave", leave);
      api.current = null;
    };
  }, [landed]);

  const label = landed
    ? `The committers, landed: ${birds.length} wallets on one wire.`
    : `The flock: one bird per committer, ${birds.length} in all. Hover a bird to read its commit.`;

  return (
    <section ref={bandRef} className={`band${landed ? " landed" : ""}`} aria-label={label}>
      {landed ? <Perched birds={birds} /> : <canvas ref={canvasRef} />}
      <p className="cap">{caption}</p>
      <div className="key" aria-hidden="true">
        <span>
          <i />a commit
        </span>
        <span>
          <i className="d" />
          the creator
        </span>
        <span>
          <i className="y" />
          you
        </span>
      </div>
      {tip && (
        <div className="tip" role="status" style={{ transform: `translate(${tip.x}px, ${tip.y}px)` }}>
          {tip.text}
        </div>
      )}
    </section>
  );
}

/** After T0: every committer on one wire, sized by commit, in commit order. */
function Perched({ birds }: { birds: FlockBird[] }) {
  const w = 1200;
  const h = 210;
  const y0 = 128;
  const n = birds.length;
  const top = birds.reduce((m, b) => (b.amount > m ? b.amount : m), 1n);
  const gap = n ? Math.min(46, (w - 160) / n) : 0;
  const x0 = w / 2 - (gap * (n - 1)) / 2;
  const Y = (x: number) => {
    const u = (x - w / 2) / (w / 2);
    return y0 + 14 * (1 - u * u);
  };
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path d={`M-20 ${y0} Q ${w / 2} ${y0 + 28} ${w + 20} ${y0}`} fill="none" stroke={INK} strokeWidth={1.3} />
      {birds.map((b, i) => {
        const x = x0 + i * gap;
        const rel = Math.sqrt(Math.min(1, Number(b.amount) / Number(top)));
        const size = Math.max(7, Math.min(22, gap * 0.8)) * (0.75 + 0.35 * rel);
        return (
          <Perch
            key={b.wallet}
            x={x}
            y={Y(x) + 0.6}
            w={size}
            fill={b.you ? WING : b.dev ? FOREST : INK}
            ring={b.you}
            flip={(i * 13) % 7 === 3}
            title={describe(b)}
          />
        );
      })}
    </svg>
  );
}
