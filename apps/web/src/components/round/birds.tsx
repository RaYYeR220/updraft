/* The field-guide bird: one perched silhouette (SVG) and one in flight (canvas path). */

export const INK = "#231e19";
export const FOREST = "#2e4527";
export const WING = "#c7d83b";

/** Perched bird, 12 × 16 units, feet at the bottom edge. */
export function PerchPath() {
  return (
    <>
      <path d="M3.9 11.2 L0.7 15.7 L2.3 15.95 L5.4 12.4 Z" />
      <ellipse cx="5.7" cy="9.3" rx="3.15" ry="4.25" transform="rotate(-18 5.7 9.3)" />
      <circle cx="7.6" cy="4.3" r="2.05" />
      <path d="M9.35 3.75 L11.9 4.45 L9.35 5.05 Z" />
      <path d="M5.6 13.2 L5.9 15.6 M6.9 13 L7 15.6" stroke="currentColor" strokeWidth=".8" fill="none" />
    </>
  );
}

/** A perched bird standing at (x, y) with width w. */
export function Perch({
  x,
  y,
  w,
  fill = INK,
  flip = false,
  ring = false,
  title,
}: {
  x: number;
  y: number;
  w: number;
  fill?: string;
  flip?: boolean;
  ring?: boolean;
  title?: string;
}) {
  const k = w / 12;
  const h = 16 * k;
  const tx = flip ? x + w / 2 : x - w / 2;
  return (
    <g
      transform={`translate(${tx.toFixed(2)} ${(y - h).toFixed(2)}) scale(${flip ? -k : k} ${k})`}
      fill={fill}
      color={fill}
      stroke={ring ? FOREST : undefined}
      strokeWidth={ring ? 0.7 / k : undefined}
    >
      {title && <title>{title}</title>}
      <PerchPath />
    </g>
  );
}

interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(a: number, b: number, x: number, y: number): void;
  closePath(): void;
}

/** A bird in flight: body along `ang`, wings at flap phase `phi`, banking by `roll`. */
export function flyBird(P: PathSink, x: number, y: number, ang: number, s: number, phi: number, roll: number, us: number) {
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const ux = us * sa;
  const uy = -us * ca;
  const X = (k: number, u: number) => x + (ca * k + ux * u) * s;
  const Y = (k: number, u: number) => y + (sa * k + uy * u) * s;
  P.moveTo(X(1.34, 0.03), Y(1.34, 0.03));
  P.lineTo(X(0.82, 0.21), Y(0.82, 0.21));
  P.quadraticCurveTo(X(0.05, 0.32), Y(0.05, 0.32), X(-0.62, 0.11), Y(-0.62, 0.11));
  P.lineTo(X(-1.12, 0.22), Y(-1.12, 0.22));
  P.lineTo(X(-1.0, 0.02), Y(-1.0, 0.02));
  P.lineTo(X(-1.1, -0.16), Y(-1.1, -0.16));
  P.lineTo(X(-0.55, -0.12), Y(-0.55, -0.12));
  P.quadraticCurveTo(X(0.25, -0.27), Y(0.25, -0.27), X(0.84, -0.12), Y(0.84, -0.12));
  P.closePath();
  const L = 1.95;
  const dx = 0.18;
  const dy = 0.4;
  for (const sg of [1, -1]) {
    const a = phi + sg * roll;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const vx = (sg * dx * c + ux * sn) * L;
    const vy = (sg * dy * c + uy * sn) * L;
    const sx = X(0.44, 0.1);
    const sy = Y(0.44, 0.1);
    const rx = X(-0.44, 0.04);
    const ry = Y(-0.44, 0.04);
    const tx = sx + (vx - ca * 0.48) * s;
    const ty = sy + (vy - sa * 0.48) * s;
    P.moveTo(sx, sy);
    P.quadraticCurveTo(sx + (vx * 0.5 + ca * 0.22) * s, sy + (vy * 0.5 + sa * 0.22) * s, tx, ty);
    P.quadraticCurveTo(rx + (vx * 0.62 - ca * 0.02) * s, ry + (vy * 0.62 - sa * 0.02) * s, rx, ry);
    P.closePath();
  }
}

export function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The settled wire between two posts, one bird per participant, at most 40. */
export function WireArt({
  birds,
  you = -1,
  dev = -1,
  labels = true,
  width = 460,
  height = 120,
}: {
  birds: number;
  you?: number;
  dev?: number;
  labels?: boolean;
  width?: number;
  height?: number;
}) {
  const w = width;
  const y0 = height - 28;
  const x0 = 10;
  const x1 = w - 10;
  const n = Math.max(0, Math.min(birds, 40));
  const span = x1 - x0 - 14;
  const Y = (x: number) => {
    const u = (x - w / 2) / (w / 2);
    return y0 - 10 + 9 * (1 - u * u);
  };
  const xAt = (i: number) => x0 + 7 + (span * (i + 0.5)) / Math.max(n, 1);
  const size = (n <= 8 ? 14 : 10) * Math.min(1.8, Math.max(1, w / 460));
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      {[x0 - 2, x1 + 2].map((px) => (
        <g key={px} stroke={INK}>
          <line x1={px} y1={y0 - 30} x2={px} y2={height} strokeWidth={2.4} />
          <line x1={px - 12} y1={y0 - 14} x2={px + 12} y2={y0 - 14} strokeWidth={1.6} />
        </g>
      ))}
      <path d={`M${x0 - 2} ${y0 - 10} Q ${w / 2} ${y0 + 8} ${x1 + 2} ${y0 - 10}`} fill="none" stroke={INK} strokeWidth={1.2} />
      {Array.from({ length: n }, (_, i) => {
        const x = xAt(i);
        return (
          <Perch
            key={i}
            x={x}
            y={Y(x) + 0.6}
            w={size}
            fill={i === you ? WING : i === dev ? FOREST : INK}
            ring={i === you}
            flip={(i * 13) % 7 === 3}
          />
        );
      })}
      {labels &&
        [
          [you, "you"],
          [dev, "the creator"],
        ].map(([i, label]) =>
          typeof i === "number" && i >= 0 && i < n ? (
            <g key={label}>
              <text className="wire-lbl" x={xAt(i)} y={y0 - 58} textAnchor="middle">
                {label}
              </text>
              <line x1={xAt(i)} y1={y0 - 52} x2={xAt(i)} y2={y0 - 34} stroke="#4f463b" />
            </g>
          ) : null,
        )}
    </svg>
  );
}

/** The certificate seal. */
export function Seal({ className, id = "seal-ring" }: { className?: string; id?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <path id={id} d="M32 32 m-23 0 a23 23 0 1 1 46 0 a23 23 0 1 1 -46 0" />
      </defs>
      <circle cx="32" cy="32" r="30" fill="none" stroke={FOREST} strokeWidth="1" />
      <circle cx="32" cy="32" r="16" fill={WING} stroke={FOREST} strokeWidth="1" />
      <text className="seal-txt" fontSize="6.6" fontWeight="600" fill={FOREST} letterSpacing="1.1">
        <textPath href={`#${id}`}>ONE WIRE · ONE PRICE · ONE WIRE · ONE PRICE ·</textPath>
      </text>
      <path d="M22 34 L29 28.5 L32 31.5 L35 28.5 L42 34 L35 31.6 L32 35.2 L29 31.6 Z" fill={INK} />
    </svg>
  );
}
