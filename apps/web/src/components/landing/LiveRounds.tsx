import Link from "next/link";
import type { RoundRow } from "@/lib/data";
import { Perch } from "./Bird";
import { flyPath, mulberry } from "./birds";
import { Countdown } from "./Countdown";
import { type LogEntry, isRehearsal } from "./data";
import { dollars, priceFromX96, short, units, usdc, utc } from "./format";

function WireBox({ birds, perched, seed }: { birds: number; perched: boolean; seed: number }) {
  const w = 340,
    h = 64,
    r = mulberry(31 + seed);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMax meet">
      <path d={`M0 ${h - 12} Q ${w / 2} ${h - 2} ${w} ${h - 12}`} fill="none" stroke="#231e19" strokeWidth={1.2} />
      {perched
        ? Array.from({ length: birds }, (_, i) => {
            const gap = Math.min(26, (w - 16) / Math.max(1, birds - 1));
            const x = w / 2 + (i - (birds - 1) / 2) * gap;
            const u = (x / w) * 2 - 1;
            return <Perch key={i} x={x} y={h - 12 + 10 * (1 - u * u) * 0.5 + 0.6} w={8.6} fill="#231e19" flip={i % 5 === 2} />;
          })
        : Array.from({ length: birds }, (_, i) => {
            const cx = 130 + seed * 50,
              a = r() * Math.PI * 2,
              rr = Math.sqrt(r()),
              x = cx + Math.cos(a) * rr * 105,
              y = 24 + Math.sin(a) * rr * 16 + Math.sin((x - cx) / 40) * 5;
            const d = flyPath(x, y, Math.PI + 0.1 + (r() - 0.5) * 0.4, 2.9 + r() * 1.6, -0.4 + r() * 1.4);
            return <path key={i} d={d} fill="#231e19" opacity={(0.62 + r() * 0.38).toFixed(2)} />;
          })}
    </svg>
  );
}

function statusOf(r: RoundRow, now: number) {
  if (r.status === "fired") return { cls: "fired", label: "Fired" };
  if (r.status === "aborted") return { cls: "lock", label: "Aborted" };
  if (now < r.lockAt) return { cls: "open", label: "Open" };
  if (now < r.closeAt) return { cls: "lock", label: "Locked" };
  return { cls: "lock", label: "Ready to fire" };
}

function RoundCard({ r, i, now }: { r: RoundRow; i: number; now: number }) {
  const st = statusOf(r, now);
  const rehearsal = isRehearsal(r);
  const max = units(r.maxRaise, 6);
  const raised = units(r.status === "fired" ? r.quoteUsed : r.totalCommitted, 6);
  const fill = max > 0 ? Math.min(100, (raised / max) * 100) : 0;
  const birds = Math.max(1, Math.min(r.status === "fired" ? 26 : 34, r.participants));
  const mode = r.mode === 1 ? "Verified" : "Open";
  return (
    <article className="round">
      <div className="round-top">
        <h3 className={r.name.length > 12 ? "long" : undefined}>
          {r.name}
          <small>
            ${r.symbol}, {mode} round{rehearsal ? ", rehearsal" : ""}
          </small>
        </h3>
        <span className={`status ${st.cls}`}>
          <i />
          {st.label}
        </span>
      </div>
      <div className="wirebox" aria-hidden="true">
        {r.status !== "aborted" && <WireBox birds={birds} perched={r.status === "fired"} seed={i} />}
      </div>
      <div className="meter" role="img" aria-label={`${Math.round(fill)}% of the maximum raise`}>
        <i style={{ width: `${Math.max(fill, r.status === "fired" ? 1.5 : 0)}%` }} />
      </div>
      {r.status === "fired" ? (
        <dl>
          <div>
            <dt>Raised, of {usdc(r.maxRaise)} max</dt>
            <dd>{usdc(r.quoteUsed)} USDC</dd>
          </div>
          <div>
            <dt>Participants</dt>
            <dd>{r.participants}</dd>
          </div>
          <div>
            <dt>Everyone&apos;s price</dt>
            <dd>{dollars(priceFromX96(r.avgPriceX96))}</dd>
          </div>
          <div>
            <dt>Fired</dt>
            <dd>{r.firedAt ? utc(r.firedAt) : "pending"}</dd>
          </div>
        </dl>
      ) : r.status === "aborted" ? (
        <dl>
          <div>
            <dt>Committed</dt>
            <dd>{usdc(r.totalCommitted)} USDC</dd>
          </div>
          <div>
            <dt>Committers</dt>
            <dd>{r.participants}</dd>
          </div>
          <div>
            <dt>Outcome</dt>
            <dd>refunds open</dd>
          </div>
        </dl>
      ) : (
        <dl>
          <div>
            <dt>Committed, of {usdc(r.maxRaise)} max</dt>
            <dd>{usdc(r.totalCommitted)} USDC</dd>
          </div>
          <div>
            <dt>Committers</dt>
            <dd>{r.participants}</dd>
          </div>
          <div>
            <dt>{now < r.lockAt ? "Lock" : "Withdrawals"}</dt>
            <dd>{now < r.lockAt ? <Countdown to={r.lockAt} /> : "closed"}</dd>
          </div>
          <div>
            <dt>T0</dt>
            <dd>
              <Countdown to={r.closeAt} />
            </dd>
          </div>
        </dl>
      )}
      <Link className="link go" href={`/rounds/${r.id}`}>
        {r.status === "live" ? (now < r.lockAt ? "Join this round" : "Watch it fire") : r.status === "fired" ? "Read the round" : "See refunds"}
      </Link>
    </article>
  );
}

function Log({ entries }: { entries: LogEntry[] }) {
  if (entries.length === 0) return null;
  // The track holds the entries twice so the marquee loops without a seam; the copy is hidden from assistive tech.
  const base = entries.length >= 8 ? entries : Array.from({ length: 8 }, (_, i) => entries[i % entries.length]);
  const row = (copy: boolean) =>
    base.map((e, i) => (
      <span key={`${copy ? "b" : "a"}${i}`} aria-hidden={copy || i >= entries.length || undefined}>
        {utc(e.at, false)} <span className="mono">{short(e.wallet)}</span>{" "}
        {e.kind === "commit" ? "committed" : e.kind === "withdraw" ? "withdrew" : "was refunded"} <b>{usdc(e.amount)} USDC</b>{" "}
        {e.kind === "commit" ? "to" : "from"} {e.symbol}
      </span>
    ));
  return (
    <div className="log" role="region" aria-label="Field log: the latest commits, read from the indexer">
      <div className="track">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}

export function LiveRounds({ rounds, log }: { rounds: RoundRow[]; log: LogEntry[] }) {
  const now = Math.floor(Date.now() / 1000);
  const anyLive = rounds.some((r) => r.status === "live");
  const allRehearsals = rounds.length > 0 && rounds.every(isRehearsal);
  return (
    <section className="sec" id="rounds" aria-labelledby="h-r">
      <div className="wrap">
        <div className="sec-head">
          <div className="sec-title">
            <p className="plate-no">
              <b>VII</b>On the wire
            </p>
            <h2 className="h2" id="h-r">
              {anyLive ? "Rounds gathering now." : "The latest rounds on the wire."}
            </h2>
          </div>
          <p className="lede">
            {anyLive
              ? "Join before the lock. Until then you can withdraw; after T0 you hold tokens at the same price as everyone in the round."
              : "No round is gathering right now. When one opens you can join until the lock, and after T0 you hold tokens at the same price as everyone in it."}
          </p>
        </div>

        {rounds.length === 0 ? (
          <div className="empty">
            <p className="h4">No rounds on the wire yet.</p>
            <p>
              The first round opens from Creator Studio. <Link className="link" href="/studio">Set one up</Link> or{" "}
              <Link className="link" href="/rounds">check the rounds page</Link>.
            </p>
          </div>
        ) : (
          <>
            <Log entries={log} />
            <div className="rounds">
              {rounds.map((r, i) => (
                <RoundCard key={r.id} r={r} i={i} now={now} />
              ))}
            </div>
            <p className="cap ex-note">
              {allRehearsals
                ? "Live from the indexer. Every round so far is a rehearsal we ran on Elysium testnet to prove the flow end to end."
                : "Live from the indexer, Elysium testnet. Rehearsal rounds are ours and marked as such."}{" "}
              <Link className="cap-link" href="/rounds">
                All rounds
              </Link>
            </p>
          </>
        )}
      </div>
    </section>
  );
}
