import type { SVGProps } from "react";
import { perchTransform } from "./birds";

/** The perched starling every field-guide figure draws with; rendered once per page, used by `Perch`. */
export function PerchDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <symbol id="perch" viewBox="0 0 12 16">
          <path d="M3.9 11.2 L0.7 15.7 L2.3 15.95 L5.4 12.4 Z" />
          <ellipse cx="5.7" cy="9.3" rx="3.15" ry="4.25" transform="rotate(-18 5.7 9.3)" />
          <circle cx="7.6" cy="4.3" r="2.05" />
          <path d="M9.35 3.75 L11.9 4.45 L9.35 5.05 Z" />
          <path d="M5.6 13.2 L5.9 15.6 M6.9 13 L7 15.6" stroke="currentColor" strokeWidth=".8" fill="none" />
        </symbol>
      </defs>
    </svg>
  );
}

/** A perched starling with its feet on (x, y). */
export function Perch({
  x,
  y,
  w,
  fill,
  flip = false,
  ...rest
}: { x: number; y: number; w: number; fill: string; flip?: boolean } & Omit<SVGProps<SVGUseElement>, "x" | "y" | "fill">) {
  return <use href="#perch" width={w} height={(w * 16) / 12} fill={fill} color={fill} transform={perchTransform(x, y, w, flip)} {...rest} />;
}
