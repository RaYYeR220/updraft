"use client";

import { useEffect, useState } from "react";
import { soon, when } from "@/components/round/format";

/** "in 1d 03h", ticking; the absolute UTC time until it mounts, so server and client agree. */
export function Countdown({ to }: { to: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return <time dateTime={new Date(to * 1000).toISOString()}>{when(to)}</time>;
  return (
    <time dateTime={new Date(to * 1000).toISOString()} title={when(to)}>
      {to > now ? `in ${soon(to - now)}` : "passed"}
    </time>
  );
}
