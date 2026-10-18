// Field-guide drawing kit: the perched starling (an SVG symbol), the starling in flight and the hawk,
// as paths that render the same on the server (SVG) and on the hero canvas.

/** Deterministic PRNG, so server-drawn flocks match on every render. */
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

/** The subset of the canvas path API the birds need; a canvas context satisfies it. */
export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  closePath(): void;
}

export class PathStr implements PathSink {
  d = "";
  moveTo(x: number, y: number) {
    this.d += `M${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  lineTo(x: number, y: number) {
    this.d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  quadraticCurveTo(a: number, b: number, x: number, y: number) {
    this.d += `Q${a.toFixed(1)} ${b.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  closePath() {
    this.d += "Z";
  }
}

/**
 * A starling in flight, seen from the side and a little below. The wings rotate about the heading
 * (flap) and are projected, so a bird reads as a "v" on the upstroke and a "^" on the downstroke.
 */
export function flyBird(P: PathSink, x: number, y: number, ang: number, s: number, phi: number, roll: number, us: number) {
  const ca = Math.cos(ang),
    sa = Math.sin(ang),
    ux = us * sa,
    uy = -us * ca;
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
  const L = 1.95,
    dx = 0.18,
    dy = 0.4;
  for (const sg of [1, -1]) {
    const a = phi + sg * roll,
      c = Math.cos(a),
      sn = Math.sin(a);
    const vx = (sg * dx * c + ux * sn) * L,
      vy = (sg * dy * c + uy * sn) * L;
    const sx = X(0.44, 0.1),
      sy = Y(0.44, 0.1),
      rx = X(-0.44, 0.04),
      ry = Y(-0.44, 0.04);
    const tx = sx + (vx - ca * 0.48) * s,
      ty = sy + (vy - sa * 0.48) * s;
    P.moveTo(sx, sy);
    P.quadraticCurveTo(sx + (vx * 0.5 + ca * 0.22) * s, sy + (vy * 0.5 + sa * 0.22) * s, tx, ty);
    P.quadraticCurveTo(rx + (vx * 0.62 - ca * 0.02) * s, ry + (vy * 0.62 - sa * 0.02) * s, rx, ry);
    P.closePath();
  }
}

/** SVG path data for one bird in flight. */
export function flyPath(x: number, y: number, ang: number, s: number, phi: number): string {
  const p = new PathStr();
  flyBird(p, x, y, ang, s, phi, 0, Math.cos(ang) >= 0 ? 1 : -1);
  return p.d;
}

/** Front view of a soaring buteo: broad wings in a shallow V, fingered primaries, fanned tail. */
const HAWK: [number, number][] = [
  [0.1, -0.31], [0.15, -0.16], [0.6, -0.24], [1.05, -0.33], [1.5, -0.43], [1.68, -0.5], [1.63, -0.41], [1.79, -0.4],
  [1.66, -0.33], [1.77, -0.27], [1.6, -0.24], [1.64, -0.16], [1.46, -0.15], [1.0, -0.06], [0.52, 0.08], [0.2, 0.14],
  [0.17, 0.32], [0.3, 0.8], [0.14, 0.92],
];

export function hawkPath(P: PathSink) {
  P.moveTo(0, -0.43);
  for (const [x, y] of HAWK) P.lineTo(x, y);
  P.quadraticCurveTo(0, 0.98, -0.14, 0.92);
  for (let i = HAWK.length - 2; i >= 0; i--) P.lineTo(-HAWK[i][0], HAWK[i][1]);
  P.closePath();
}

export function hawkD(): string {
  const p = new PathStr();
  hawkPath(p);
  return p.d;
}

/** Transform for a `#perch` symbol whose feet land on (x, y), `w` wide, facing left when flipped. */
export function perchTransform(x: number, y: number, w: number, flip = false): string {
  const h = (w * 16) / 12;
  return `translate(${(x - (flip ? -w / 2 : w / 2)).toFixed(2)} ${(y - h).toFixed(2)})${flip ? " scale(-1 1)" : ""}`;
}
