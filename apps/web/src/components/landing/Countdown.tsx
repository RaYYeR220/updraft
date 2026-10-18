"use client";

import { useEffect, useState } from "react";

function fmt(s: number) {
  s = Math.max(0, Math.round(s));
  const d = Math.floor(s / 86400),
    h = Math.floor((s % 86400) / 3600),
    m = Math.floor((s % 3600) / 60),
    ss = s % 60;
  if (s === 0) return "now";
  if (d) return `in ${d}d ${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
  if (h) return `in ${h}h ${String(m).padStart(2, "0")}m`;
  return `in ${m}m ${String(ss).padStart(2, "0")}s`;
}

/** Time left until a unix timestamp, ticking each second. */
export function Countdown({ to }: { to: number }) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, []);
  return <span suppressHydrationWarning>{fmt(to - now)}</span>;
}
