"use client";

import { useEffect } from "react";
import type { Address } from "viem";
import { Status } from "@updraft/sdk";
import { MarkGlyph } from "@/components/chrome/Mark";
import { PHASE_LABEL, countdown, isRehearsal, phaseOf, price, priceFromX96, usdc } from "./format";
import { useNow, useRoundState } from "./hooks";

/** Tells the parent page how tall this frame needs to be. */
function usePostHeight() {
  useEffect(() => {
    const post = () => window.parent?.postMessage({ updraftHeight: document.documentElement.scrollHeight }, "*");
    post();
    window.addEventListener("load", post);
    window.addEventListener("resize", post);
    const ro = new ResizeObserver(post);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("load", post);
      window.removeEventListener("resize", post);
      ro.disconnect();
    };
  }, []);
}

export function EmbedCard({ address }: { address: Address }) {
  usePostHeight();
  const now = useNow();
  const { known, state } = useRoundState(address);
  const href = `/rounds/${address}`;

  if (known.data === null) {
    return (
      <article className="em-card">
        <p className="em-msg">No Updraft round at this address.</p>
      </article>
    );
  }
  const s = state.data;
  if (!s || now === null) {
    return (
      <article className="em-card" aria-busy="true">
        <p className="em-msg">{known.isError || state.isError ? "Elysium didn't answer. Retrying…" : "Reading the round…"}</p>
      </article>
    );
  }

  const w = s.config.windows;
  const phase = phaseOf(s.status, w, now);
  const fired = s.status === Status.Fired && s.fired;
  const max = s.config.raise.maxRaise;
  const fill = fired ? 100 : max > 0n ? Math.min(100, (Number(s.totalCommitted) / Number(max)) * 100) : 0;
  const avg = fired && s.fired ? (s.fired.netTokens > 0n ? Number(s.fired.quoteUsed) / 1e6 / (Number(s.fired.netTokens) / 1e18) : 0) : priceFromX96(s.preview.avgPriceX96);
  const clock: [string, string] | null =
    phase === "upcoming"
      ? ["Opens in", countdown(w.openAt - now)]
      : phase === "open"
        ? ["Lock in", countdown(w.lockAt - now)]
        : phase === "locked"
          ? ["T0 in", countdown(w.closeAt - now)]
          : phase === "ready"
            ? ["Fire by", countdown(w.fireBy - now)]
            : null;

  return (
    <article className="em-card" aria-label={`${s.config.name} round on Updraft`}>
      <header className="em-top">
        <div>
          <h1>
            {s.config.name} <small>${s.config.symbol}</small>
          </h1>
          <p className="em-sub">
            {s.config.mode === 1 ? "Verified round" : "Open round"} on Ascend{isRehearsal(s.config.creator, s.config.name) ? ", a rehearsal" : ""}
          </p>
        </div>
        <span className={`em-st ${phase}`}>
          <i />
          {PHASE_LABEL[phase]}
        </span>
      </header>
      <div className="em-meter" aria-hidden="true">
        <i style={{ width: `${fill}%` }} />
      </div>
      <dl className="em-facts">
        <div>
          <dt>{fired ? "Raised" : "Committed"}</dt>
          <dd>
            {usdc(fired && s.fired ? s.fired.quoteUsed : s.totalCommitted)}
            {!fired && <span> / {usdc(max)}</span>} USDC
          </dd>
        </div>
        <div>
          <dt>{fired ? "Participants" : "Committers"}</dt>
          <dd>{s.participantCount}</dd>
        </div>
        <div>
          <dt>{fired ? "Everyone paid" : "Everyone's price now"}</dt>
          <dd>{avg > 0 ? price(avg) : "no batch yet"}</dd>
        </div>
        <div>
          <dt>{clock ? clock[0] : "Status"}</dt>
          <dd className="num">{clock ? clock[1] : phase === "fired" ? "landed at T0" : phase === "aborted" ? "refunds open" : "past fire-by"}</dd>
        </div>
      </dl>
      <footer className="em-foot">
        <a className="em-go" href={href} target="_blank" rel="noopener">
          {phase === "open" || phase === "locked" || phase === "upcoming" ? "Commit on Updraft" : "See the round on Updraft"}
        </a>
        <span className="em-brand" aria-hidden="true">
          <MarkGlyph />
          Updraft
        </span>
      </footer>
    </article>
  );
}
