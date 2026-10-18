// The murmuration on the landing hero. One bird per commit: a 3D flock (an ellipsoid of birds that
// rotates, breathes and carries a turn across itself), each bird spring-following its place in the
// formation. At T0 the birds peel off in commit order and land on one wire, which sags under the
// load. A hawk (a buyer after T0) circles above. Then the flock lifts and the cycle repeats.
import { flyBird, hawkPath, mulberry } from "./birds";

export interface FlockElements {
  hero: HTMLElement;
  canvas: HTMLCanvasElement;
  ctas: HTMLElement;
  tip: HTMLElement;
  capText: HTMLElement;
  prog: HTMLElement;
  phases: HTMLElement[];
  hawk: HTMLElement;
  wire: HTMLElement;
  you: HTMLElement;
  dev: HTMLElement;
}

type Phase = "commit" | "fire" | "land";
type State = "fly" | "land" | "perch" | "wait" | "up";

interface Bird {
  i: number;
  lx: number;
  ly: number;
  lz: number;
  lag: number;
  amt: number;
  addr: string;
  sz: number;
  ph: number;
  gph: number;
  hz: number;
  nx: number;
  ny: number;
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
  state: State;
  face: number;
  post: number;
  idle: number;
  hop: number;
  settle: number;
  jit: number;
  lift: number;
  upT: number;
  slot: number;
  path: { t0: number; D: number; x0: number; y0: number; vx0: number; vy0: number; x1: number; y1: number; vx1: number; vy1: number } | null;
  you: boolean;
  dev: boolean;
}

const TAU = Math.PI * 2;
const T_WHEEL = 8.5,
  T_STAG = 4.8,
  T_TAIL = 2.0,
  T_REST = 9;
const CYCLE = T_WHEEL + T_STAG + T_TAIL + T_REST;
const INK = ["#231e19", "#2b251f", "#373028", "#463e34", "#584f43", "#6d6353", "#837865"];

export function startMurmuration(el: FlockElements): () => void {
  const { hero, canvas: cv, ctas, tip } = el;
  const ctx = cv.getContext("2d");
  if (!ctx) return () => {};
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 0,
    H = 0,
    dpr = 1,
    M = false,
    N = 0,
    S = 0;
  let birds: Bird[] = [];
  let wire = { x0: 0, x1: 0, y: 0, sag: 0 };
  let zone = { top: 0, bot: 0, cy: 0, h: 0 };
  const hk = { a: 0, cx: 0, cy: 0, rx: 0, ry: 0, s: 0, ox: 0, oy: 0, pres: 0 };
  let t = 0,
    last = 0,
    raf = 0,
    running = false,
    cycleStart = 0,
    landedAll = 0,
    phase: Phase | "" = "",
    liftOrigin = 0;
  let bumps: { x: number; t: number; a: number }[] = [];

  const caps = (): Record<Phase, string> => ({
    commit: `Before T0: ${N} commits wheel as one flock. Anyone can leave until the lock.`,
    fire: "T0: one transaction fires the round. Birds land in commit order.",
    land: `After T0: ${N} birds, one wire, one price. The dev's bird is on it too.`,
  });

  function layout() {
    const r = hero.getBoundingClientRect();
    W = Math.round(r.width);
    H = Math.round(r.height);
    M = W < 820;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    const cb = ctas.getBoundingClientRect().bottom - r.top;
    wire = M ? { x0: 26, x1: W - 12, y: H - 128, sag: 6 } : { x0: W * 0.045, x1: W * 0.955, y: H - 134, sag: 9 };
    const top = cb + (M ? 26 : 34),
      bot = wire.y - (M ? 40 : 48);
    zone = { top, bot, cy: (top + bot) / 2, h: Math.max(80, bot - top) };
    S = M ? Math.min(W * 0.3, zone.h * 1.05) : Math.min(W * 0.19, zone.h * 1.2, 256);
    Object.assign(
      hk,
      M
        ? { cx: W * 0.7, cy: zone.top + zone.h * 0.25, rx: 40, ry: 10, s: 13 }
        : { cx: W * 0.78, cy: zone.top + zone.h * 0.32, rx: 92, ry: 20, s: 22 },
    );
    hk.ox = W + 140;
    hk.oy = Math.max(110, cb - 120);
    const pad = M ? 8 : 16,
      spanX = wire.x1 - wire.x0 - pad * 2;
    birds.forEach((b, i) => {
      b.slot = wire.x0 + pad + (spanX * (i + 0.5)) / birds.length + b.jit;
    });
    el.wire.style.transform = `translate(${Math.round(wire.x1 - 4)}px, ${Math.round(wire.y + 24)}px) translateX(-100%)`;
    el.hawk.style.display = M ? "none" : "";
    el.dev.style.display = M ? "none" : "";
    el.wire.style.display = M ? "none" : "";
  }

  function build() {
    const r = mulberry(20261018);
    N = innerWidth < 820 ? 44 : 120;
    birds = [];
    for (let i = 0; i < N; i++) {
      let lx: number, ly: number, lz: number;
      do {
        lx = r() * 2 - 1;
        ly = r() * 2 - 1;
        lz = r() * 2 - 1;
      } while (lx * lx + ly * ly + lz * lz > 1);
      const k = 0.42 + 0.58 * Math.pow(r(), 0.8);
      const amt = Math.round(Math.exp(Math.log(20) + Math.pow(r(), 1.5) * Math.log(1000 / 20)) / 5) * 5;
      const hex = () =>
        Math.floor(r() * 65536)
          .toString(16)
          .padStart(4, "0");
      birds.push({
        i,
        lx: lx * k,
        ly: ly * 0.13 * k,
        lz: lz * 0.9 * k,
        lag: (lx + 1) * 0.5 * 0.95 + r() * 0.12,
        amt,
        addr: "0x" + hex() + "…" + hex(),
        sz: 0.92 + 0.22 * Math.sqrt(amt / 1000),
        ph: r() * TAU,
        gph: r() * TAU,
        hz: 3.6 + r() * 1.4,
        nx: r() * TAU,
        ny: r() * TAU,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        z: 0,
        ang: Math.PI,
        us: -1,
        turn: 0,
        phi: 0.3,
        k: 0,
        state: "fly",
        face: r() < 0.62 ? 1 : -1,
        post: r(),
        idle: 2 + r() * 7,
        hop: 0,
        settle: 0,
        jit: (r() - 0.5) * 1.6,
        lift: 0,
        upT: 0,
        slot: 0,
        path: null,
        you: false,
        dev: false,
      });
    }
    Object.assign(birds[Math.round(N * 0.56)], { you: true, amt: 250, addr: "you", sz: 1.22 });
    Object.assign(birds[Math.round(N * 0.18)], { dev: true, amt: 900, addr: "the dev", sz: 1.14 });
  }

  // the formation: a rotating, breathing ellipsoid with a travelling turn
  const A = { x: 0, y: 0, z: 0 },
    B = { x: 0, y: 0, z: 0 };
  function formation(b: Bird, tt: number, o: { x: number; y: number; z: number }) {
    const td = tt - b.lag;
    const cx = W * 0.5 + Math.sin(td * 0.21 + 1.88) * W * (M ? 0.14 : 0.21) + Math.sin(td * 0.47 + 1.3) * W * 0.04;
    const cy = zone.cy + Math.sin(td * 0.33 + 0.4) * zone.h * 0.16 + Math.sin(td * 0.71) * zone.h * 0.05;
    const st = 1 + 0.42 * Math.sin(td * 0.39 + 0.6);
    const x = b.lx * st,
      z = b.lz;
    const y =
      b.ly / Math.sqrt(st) +
      0.2 * Math.sin(b.lx * 2.1 - td * 0.95) +
      0.16 * Math.sin(b.lz * 2.5 + td * 0.7) +
      0.06 * Math.sin(b.lx * 6 - td * 2.2);
    const roll = 0.16 * Math.sin(td * 0.17 + 0.3),
      yaw = 1.0 * Math.sin(td * 0.19) + 0.4 * Math.sin(td * 0.43 + 2.1),
      pitch = 0.62 * Math.sin(td * 0.23 + 1) + 0.18 * Math.sin(td * 0.51);
    let c = Math.cos(roll),
      s = Math.sin(roll);
    const x1 = x * c - y * s,
      y1 = x * s + y * c;
    c = Math.cos(yaw);
    s = Math.sin(yaw);
    const x2 = x1 * c + z * s,
      z2 = -x1 * s + z * c;
    c = Math.cos(pitch);
    s = Math.sin(pitch);
    const y3 = y1 * c - z2 * s,
      z3 = y1 * s + z2 * c;
    const p = 1 / (1 + z3 * 0.32);
    o.x = cx + x2 * S * 1.18 * p + Math.sin(tt * 1.3 + b.nx) * 3;
    o.y = cy + y3 * Math.min(S, zone.h * 0.62) * p + Math.sin(tt * 1.7 + b.ny) * 2.4;
    o.z = z3;
  }

  // the wire: a catenary that sags under its load and rings where a bird lands
  function wireY(x: number, now: number) {
    const u = ((x - wire.x0) / (wire.x1 - wire.x0)) * 2 - 1;
    let y = wire.y + (wire.sag + (M ? 3 : 5) * landedAll) * (1 - u * u);
    for (const bp of bumps) {
      const a = now - bp.t;
      if (a > 1.6) continue;
      const d = (x - bp.x) / 44;
      y += bp.a * Math.exp(-a * 3.2) * Math.sin(a * 17) * Math.exp(-d * d);
    }
    return y;
  }

  function startLanding(b: Bird, now: number) {
    let vx = b.vx,
      vy = b.vy;
    const sp = Math.hypot(vx, vy);
    if (sp > 230) {
      vx *= 230 / sp;
      vy *= 230 / sp;
    }
    const d = Math.hypot(b.slot - b.x, wireY(b.slot, now) - b.y);
    b.path = {
      t0: now,
      D: Math.min(2.4, Math.max(1.2, d / 250)) * (0.9 + Math.random() * 0.25),
      x0: b.x,
      y0: b.y,
      vx0: vx,
      vy0: vy,
      x1: b.slot,
      y1: 0,
      vx1: b.face * 24,
      vy1: 38,
    };
    b.state = "land";
  }
  const HO = { x: 0, y: 0, vx: 0, vy: 0 };
  function hermite(p: NonNullable<Bird["path"]>, u: number, out: typeof HO) {
    const u2 = u * u,
      u3 = u2 * u,
      D = p.D;
    const h00 = 2 * u3 - 3 * u2 + 1,
      h10 = u3 - 2 * u2 + u,
      h01 = -2 * u3 + 3 * u2,
      h11 = u3 - u2;
    const d00 = 6 * u2 - 6 * u,
      d10 = 3 * u2 - 4 * u + 1,
      d01 = -6 * u2 + 6 * u,
      d11 = 3 * u2 - 2 * u;
    out.x = h00 * p.x0 + h10 * D * p.vx0 + h01 * p.x1 + h11 * D * p.vx1;
    out.y = h00 * p.y0 + h10 * D * p.vy0 + h01 * p.y1 + h11 * D * p.vy1;
    out.vx = (d00 * p.x0 + d10 * D * p.vx0 + d01 * p.x1 + d11 * D * p.vx1) / D;
    out.vy = (d00 * p.y0 + d10 * D * p.vy0 + d01 * p.y1 + d11 * D * p.vy1) / D;
  }

  function setPhase(p: Phase) {
    if (p === phase) return;
    phase = p;
    el.phases.forEach((e) => e.classList.toggle("on", e.dataset.p === p));
    el.capText.textContent = caps()[p];
    const show = p === "land" ? "1" : "0";
    el.you.style.opacity = show;
    el.dev.style.opacity = show;
  }

  function update(dt: number) {
    t += dt;
    if (t - cycleStart >= CYCLE) {
      // the flock lifts: a startle that spreads along the wire
      cycleStart = t;
      liftOrigin = wire.x0 + (0.25 + Math.random() * 0.5) * (wire.x1 - wire.x0);
      for (const b of birds)
        if (b.state === "perch") {
          b.state = "wait";
          b.lift = t + Math.abs(b.slot - liftOrigin) * (M ? 0.004 : 0.0022) + Math.random() * 0.06;
        }
    }
    const cc = t - cycleStart;
    setPhase(cc < T_WHEEL ? "commit" : landedAll < 0.999 ? "fire" : "land");
    el.prog.style.transform = `scaleX(${Math.min(1, cc / CYCLE).toFixed(4)})`;

    let landed = 0;
    for (const b of birds) {
      if (b.state === "wait" && t >= b.lift) {
        b.state = "up";
        b.upT = t;
        b.vx = (b.slot < liftOrigin ? -50 : 50) + (Math.random() - 0.5) * 110;
        b.vy = -250 - Math.random() * 110;
        b.k = 0.06;
      }
      if (b.state === "up") {
        b.vy += 140 * dt;
        b.vx *= 1 - dt * 0.5;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (t - b.upT > 0.45) b.state = "fly";
      } else if (b.state === "fly") {
        if (cc >= T_WHEEL && t >= cycleStart + T_WHEEL + b.i * (T_STAG / N)) startLanding(b, t);
        else {
          formation(b, t, A);
          formation(b, t - 1 / 60, B);
          const tvx = (A.x - B.x) * 60,
            tvy = (A.y - B.y) * 60;
          b.k = Math.min(1, b.k + dt * 0.42);
          const w = 0.6 + 2.6 * b.k * b.k;
          b.vx += ((A.x - b.x) * w * w - 2 * w * (b.vx - tvx)) * dt;
          b.vy += ((A.y - b.y) * w * w - 2 * w * (b.vy - tvy)) * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.z += (A.z - b.z) * Math.min(1, dt * 4);
        }
      }
      if (b.state === "land" && b.path) {
        const p = b.path;
        p.y1 = wireY(p.x1, t);
        const u = Math.min(1, (t - p.t0) / p.D);
        hermite(p, u, HO);
        b.x = HO.x;
        b.y = HO.y;
        b.vx = HO.vx;
        b.vy = HO.vy;
        b.z *= 1 - dt * 2;
        if (u >= 1) {
          b.state = "perch";
          b.settle = 1;
          b.x = p.x1;
          bumps.push({ x: p.x1, t, a: 2.4 * b.sz });
          if (bumps.length > 36) bumps.shift();
        }
      }
      if (b.state === "perch" || b.state === "wait") {
        landed++;
        b.x = b.slot;
        b.y = wireY(b.slot, t);
        b.settle = Math.max(0, b.settle - dt * 3.2);
        b.idle -= dt;
        if (b.idle <= 0) {
          b.idle = 3 + Math.random() * 9;
          const r = Math.random();
          if (r < 0.4) {
            b.face *= -1;
            b.hop = 1;
          } else if (r < 0.75) b.post = Math.random();
          else b.hop = 1;
        }
        b.hop = Math.max(0, b.hop - dt * 4.4);
      } else {
        // heading, roll from turn rate, wingbeat with glides
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 10) {
          const a = Math.atan2(b.vy * 0.5, b.vx);
          let d = a - b.ang;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          const step = d * Math.min(1, dt * 7);
          b.ang += step;
          b.turn += (step / Math.max(dt, 1e-3) - b.turn) * Math.min(1, dt * 5);
          const ca = Math.cos(b.ang);
          if (ca > 0.2) b.us = 1;
          else if (ca < -0.2) b.us = -1;
        }
        const gliding = b.state === "fly" && Math.sin(t * 0.8 + b.gph) > 0.5;
        const flare = b.state === "land" && !!b.path && (t - b.path.t0) / b.path.D > 0.8;
        b.ph += dt * TAU * (flare ? 7.5 : b.hz) * (gliding ? 0.0 : 1);
        const target = gliding ? 0.14 : flare ? 0.55 + 0.75 * Math.sin(b.ph) : 0.24 + 0.84 * Math.sin(b.ph);
        b.phi += (target - b.phi) * Math.min(1, dt * (gliding ? 6 : 22));
      }
    }
    landedAll += (landed / N - landedAll) * Math.min(1, dt * 3);
    if (landed === N && landedAll > 0.995) landedAll = 1;
    if (landed < N && landedAll > 0.999) landedAll = 0.998;
    hk.a += dt * 0.38;
    hk.pres += ((cc >= T_WHEEL - 0.4 && cc < CYCLE - 0.6 ? 1 : 0) - hk.pres) * Math.min(1, dt * 0.7);
  }

  function drawPercher(c: CanvasRenderingContext2D, b: Bird) {
    const k = (M ? 0.66 : 0.76) * b.sz,
      sq = 1 - 0.24 * Math.sin(b.settle * Math.PI) * b.settle,
      hop = -Math.sin(b.hop * Math.PI) * 3;
    c.setTransform(dpr * k * b.face, 0, 0, dpr * k * sq, dpr * b.x, dpr * (b.y + hop));
    c.translate(-6, -15.6);
    const body = b.you ? "#c7d83b" : "#231e19",
      wing = b.you || b.dev ? "#2e4527" : "#4f463b";
    c.fillStyle = body;
    c.beginPath();
    c.moveTo(3.9, 11.2);
    c.lineTo(0.7, 15.7);
    c.lineTo(2.3, 15.95);
    c.lineTo(5.4, 12.4);
    c.closePath();
    c.fill();
    const lean = b.post < 0.3 ? -0.1 : b.post > 0.85 ? 0.12 : 0;
    c.save();
    c.translate(5.7, 9.3);
    c.rotate(-0.32 + lean);
    c.beginPath();
    c.ellipse(0, 0, 3.15, 4.25, 0, 0, TAU);
    c.fill();
    c.restore();
    const preen = b.post > 0.85,
      hx = preen ? 5.1 : 7.6,
      hy = preen ? 4.9 : 4.3;
    c.beginPath();
    c.arc(hx, hy, 2.05, 0, TAU);
    if (preen) {
      c.moveTo(3.5, 4.5);
      c.lineTo(1.2, 6.0);
      c.lineTo(3.7, 5.8);
    } else {
      c.moveTo(9.35, 3.75);
      c.lineTo(11.9, 4.45);
      c.lineTo(9.35, 5.05);
    }
    c.fill();
    c.fillStyle = wing;
    c.beginPath();
    c.moveTo(7.8, 7.1);
    c.quadraticCurveTo(4.2, 7.0, 2.2, 12.6);
    c.lineTo(3.6, 12.4);
    c.quadraticCurveTo(6.6, 10.9, 7.8, 7.1);
    c.fill();
    if (b.you) {
      c.lineWidth = 0.8;
      c.strokeStyle = "#2e4527";
      c.beginPath();
      c.arc(hx, hy, 2.05, 0, TAU);
      c.stroke();
      c.save();
      c.translate(5.7, 9.3);
      c.rotate(-0.32 + lean);
      c.beginPath();
      c.ellipse(0, 0, 3.15, 4.25, 0, 0, TAU);
      c.stroke();
      c.restore();
    }
    if (!preen && k * dpr > 1.2) {
      c.fillStyle = b.you ? "#2e4527" : "#efe8d6";
      c.beginPath();
      c.arc(8.15, 3.85, 0.45, 0, TAU);
      c.fill();
    }
    c.strokeStyle = b.you ? "#2e4527" : "#231e19";
    c.lineWidth = 0.75;
    c.beginPath();
    c.moveTo(5.6, 13.1);
    c.lineTo(5.9, 15.6);
    c.moveTo(6.9, 12.9);
    c.lineTo(7, 15.6);
    c.stroke();
  }

  function hawkPos(): [number, number] {
    const e = hk.pres,
      k = e * e * (3 - 2 * e);
    return [hk.ox + (hk.cx + Math.cos(hk.a) * hk.rx - hk.ox) * k, hk.oy + (hk.cy + Math.sin(hk.a) * hk.ry - hk.oy) * k];
  }
  function drawHawk(c: CanvasRenderingContext2D) {
    if (hk.pres < 0.005) {
      el.hawk.style.opacity = "0";
      return;
    }
    const a = hk.a,
      [x, y] = hawkPos();
    el.hawk.style.opacity = hk.pres > 0.85 ? "1" : "0";
    if (!M) el.hawk.style.transform = `translate(${Math.round(hk.cx)}px, ${Math.round(hk.cy + hk.ry + 30)}px) translateX(-50%)`;
    const bank = 0.2 * Math.sin(a),
      fs = 0.86 + 0.14 * Math.abs(Math.cos(a));
    c.setTransform(dpr, 0, 0, dpr, dpr * x, dpr * y);
    c.rotate(bank);
    c.scale(hk.s * fs, hk.s);
    c.beginPath();
    hawkPath(c);
    c.fillStyle = "#2e4527";
    c.fill();
  }

  function drawScene() {
    const c = ctx!;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.strokeStyle = "#231e19";
    c.fillStyle = "#231e19";
    c.lineCap = "round";
    for (const px of [wire.x0, wire.x1]) {
      c.lineWidth = M ? 2.4 : 3.2;
      c.beginPath();
      c.moveTo(px, wire.y - 36);
      c.lineTo(px, H + 4);
      c.stroke();
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(px - 22, wire.y - 12);
      c.lineTo(px + 22, wire.y - 12);
      c.stroke();
      c.fillRect(px - 2.6, wire.y - 11, 5.2, 9);
    }
    c.lineWidth = 1.35;
    c.beginPath();
    for (let x = wire.x0; x < wire.x1; x += 5) {
      const y = wireY(x, t) - 2;
      if (x === wire.x0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.lineTo(wire.x1, wireY(wire.x1, t) - 2);
    c.stroke();
    drawHawk(c);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const b of birds) if (b.state === "perch" || b.state === "wait") drawPercher(c, b);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fl = birds.filter((b) => b.state !== "perch" && b.state !== "wait").sort((p, q) => q.z - p.z);
    let cur: string | null = null;
    for (const b of fl) {
      const d = Math.max(0, Math.min(6, Math.round(((b.z + 0.75) / 1.5) * 6)));
      const col = b.you ? "#c7d83b" : INK[b.state === "land" ? Math.min(d, 1) : d];
      if (col !== cur) {
        if (cur) c.fill();
        c.beginPath();
        c.fillStyle = col;
        cur = col;
      }
      const p = 1 / (1 + b.z * 0.32),
        s = (M ? 3.5 : 4.7) * b.sz * p,
        roll = Math.max(-0.6, Math.min(0.6, b.turn * 0.22));
      flyBird(c, b.x, b.y, b.ang, s, b.phi, roll, b.us);
      if (b.you) {
        c.fill();
        c.lineWidth = 0.9;
        c.strokeStyle = "#2e4527";
        c.stroke();
        c.beginPath();
        cur = "you-done";
      }
    }
    if (cur && cur !== "you-done") c.fill();
    if (phase === "land") {
      const you = birds.find((b) => b.you)!,
        dev = birds.find((b) => b.dev)!;
      el.you.style.transform = `translate(${Math.round(you.x)}px, ${Math.round(you.y - 20)}px) translate(-50%, -100%)`;
      if (!M) el.dev.style.transform = `translate(${Math.round(dev.x)}px, ${Math.round(dev.y - 22)}px) translate(-50%, -100%)`;
    }
  }

  function frame(now: number) {
    if (!running) return;
    const dt = Math.min(1 / 24, Math.max(0, (now - last) / 1000));
    last = now;
    update(dt);
    drawScene();
    raf = requestAnimationFrame(frame);
  }
  function start() {
    if (running || reduceMotion) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }
  function settleStatic() {
    for (const b of birds) {
      b.state = "perch";
      b.settle = 0;
      b.hop = 0;
      b.x = b.slot;
    }
    landedAll = 1;
    phase = "";
    setPhase("land");
    el.prog.style.transform = "scaleX(1)";
    hk.pres = 1;
    hk.a = 1.1;
    for (const b of birds) b.y = wireY(b.slot, t);
    drawScene();
  }
  function enterFromRight() {
    for (const b of birds) {
      b.state = "fly";
      b.x = W + 30 + Math.random() * W * 0.35;
      b.y = zone.cy + (Math.random() - 0.5) * zone.h * 1.4;
      b.vx = -250 - Math.random() * 80;
      b.vy = (Math.random() - 0.5) * 40;
      b.k = 0;
      b.ang = Math.PI;
      b.us = -1;
    }
  }

  build();
  layout();
  let io: IntersectionObserver | null = null;
  const onVisibility = () => (document.hidden ? stop() : start());
  if (reduceMotion) settleStatic();
  else {
    enterFromRight();
    setPhase("commit");
    io = new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting && !document.hidden ? start() : stop())), { threshold: 0.02 });
    io.observe(hero);
    document.addEventListener("visibilitychange", onVisibility);
  }

  let rw = innerWidth;
  const onResize = () => {
    const mob = innerWidth < 820,
      wasMob = rw < 820;
    rw = innerWidth;
    if (mob !== wasMob) {
      build();
      layout();
      if (reduceMotion) settleStatic();
      else {
        enterFromRight();
        cycleStart = t;
        phase = "";
        setPhase("commit");
      }
      return;
    }
    layout();
    if (reduceMotion) settleStatic();
    else if (!running) drawScene();
  };
  addEventListener("resize", onResize);

  // hover: read a bird (or the hawk)
  const onMove = (e: PointerEvent) => {
    const r = cv.getBoundingClientRect(),
      mx = e.clientX - r.left,
      my = e.clientY - r.top;
    let best: Bird | null = null,
      bd = 15 * 15;
    for (const b of birds) {
      const yy = b.state === "perch" || b.state === "wait" ? b.y - 8 : b.y;
      const d = (b.x - mx) ** 2 + (yy - my) ** 2;
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    const [hx, hy] = hawkPos(),
      onHawk = hk.pres > 0.5 && (hx - mx) ** 2 + (hy - my) ** 2 < (hk.s * 1.7) ** 2;
    if (best) {
      const perched = best.state === "perch" || best.state === "wait";
      const who = best.you ? "You" : best.dev ? "The dev" : `<span class="mono">${best.addr}</span>`;
      tip.innerHTML = `${who}, ${best.amt.toLocaleString("en-US")} USDC <i>(example)</i><br>${
        perched ? `landed ${best.i + 1} of ${N}, at the wire's one price` : `commit ${best.i + 1} of ${N}`
      }`;
    } else if (onHawk) tip.textContent = "The hawk: a buyer right after T0 pays Ascend's launch fee (90%, falling to 1% over 5 seconds) and a higher price.";
    if (best || onHawk) {
      tip.style.transform = `translate(${Math.min(innerWidth - 270, e.clientX + 16)}px, ${e.clientY - 58}px)`;
      tip.style.opacity = "1";
      cv.style.cursor = "crosshair";
    } else {
      tip.style.opacity = "0";
      cv.style.cursor = "";
    }
  };
  const onLeave = () => {
    tip.style.opacity = "0";
  };
  hero.addEventListener("pointermove", onMove);
  hero.addEventListener("pointerleave", onLeave);

  return () => {
    stop();
    io?.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    removeEventListener("resize", onResize);
    hero.removeEventListener("pointermove", onMove);
    hero.removeEventListener("pointerleave", onLeave);
  };
}
