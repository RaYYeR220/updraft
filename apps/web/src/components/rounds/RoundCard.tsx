import Link from "next/link";
import { WireArt } from "@/components/round/birds";
import { abortWords, isRehearsal, price, priceFromX96, usdc, usdcNum, when } from "@/components/round/format";
import type { RoundRow } from "@/lib/data";
import { Countdown } from "./Countdown";

export type Shelf = "live" | "upcoming" | "fired" | "aborted";

/** Which shelf a round sits on, from its indexed status and the clock. */
export function shelfOf(r: RoundRow, now: number): Shelf {
  if (r.status === "fired") return "fired";
  if (r.status === "aborted") return "aborted";
  return now < r.openAt ? "upcoming" : "live";
}

function statusOf(r: RoundRow, now: number): { label: string; cls: string } {
  if (r.status === "fired") return { label: "Fired", cls: "fired" };
  if (r.status === "aborted") return { label: "Aborted", cls: "aborted" };
  if (now < r.openAt) return { label: "Opens soon", cls: "soon" };
  if (now < r.lockAt) return { label: "Open", cls: "open" };
  if (now < r.closeAt) return { label: "Locked", cls: "lock" };
  if (now <= r.fireBy) return { label: "Ready to fire", cls: "open" };
  return { label: "Past fire-by", cls: "aborted" };
}

/** One field-guide card per round. `no` is the round's position in the factory that created it. */
export function RoundCard({ r, no, now }: { r: RoundRow; no: number | null; now: number }) {
  const st = statusOf(r, now);
  const rehearsal = isRehearsal(r.creator, r.name);
  const committed = usdcNum(r.totalCommitted);
  const max = usdcNum(r.maxRaise);
  const fill = r.status === "fired" ? 100 : Math.min(100, max ? (committed / max) * 100 : 0);
  const href = `/rounds/${r.id}`;
  return (
    <article className="rcard">
      <div className="rcard-top">
        <h3>
          <Link href={href} className="rcard-name">
            {r.name}
          </Link>
          <small>
            ${r.symbol}, {r.mode === 1 ? "Verified round" : "Open round"}
          </small>
        </h3>
        <span className={`status ${st.cls}`}>
          <i />
          {st.label}
        </span>
      </div>
      {(no || rehearsal) && (
        <p className="cap rcard-no">
          {no ? `No. ${String(no).padStart(4, "0")}` : ""}
          {no && rehearsal ? ", a" : rehearsal ? "A" : ""}
          {rehearsal ? " rehearsal by the Updraft team" : ""}
        </p>
      )}
      <div className="wirebox" aria-hidden="true">
        <WireArt birds={r.participants} labels={false} width={420} height={70} />
      </div>
      <div className="meter" role="img" aria-label={r.status === "fired" ? "Fired" : `${Math.round(fill)}% of the max raise committed`}>
        <i style={{ width: `${fill}%` }} />
      </div>
      <dl>
        {r.status === "fired" ? (
          <>
            <div>
              <dt>Raised</dt>
              <dd>{usdc(r.quoteUsed ?? r.totalCommitted)} USDC</dd>
            </div>
            <div>
              <dt>Participants</dt>
              <dd>{r.participants}</dd>
            </div>
            <div>
              <dt>Everyone's price</dt>
              <dd>{r.avgPriceX96 ? price(priceFromX96(r.avgPriceX96)) : "n/a"}</dd>
            </div>
            <div>
              <dt>Fired</dt>
              <dd>{r.firedAt ? when(r.firedAt).replace(/ UTC$/, "") : "n/a"}</dd>
            </div>
          </>
        ) : r.status === "aborted" ? (
          <>
            <div>
              <dt>Committed</dt>
              <dd>{usdc(r.totalCommitted)} USDC</dd>
            </div>
            <div>
              <dt>Participants</dt>
              <dd>{r.participants}</dd>
            </div>
            <div className="wide">
              <dt>Why</dt>
              <dd className="why">{abortWords(r.abortReason)}</dd>
            </div>
          </>
        ) : (
          <>
            <div>
              <dt>Committed</dt>
              <dd>
                {usdc(r.totalCommitted)} <span className="of">/ {usdc(r.maxRaise)} USDC</span>
              </dd>
            </div>
            <div>
              <dt>Committers</dt>
              <dd>{r.participants}</dd>
            </div>
            <div>
              <dt>{now < r.openAt ? "Opens" : now < r.lockAt ? "Lock" : "Withdrawals"}</dt>
              <dd>
                {now < r.openAt ? <Countdown to={r.openAt} /> : now < r.lockAt ? <Countdown to={r.lockAt} /> : "closed"}
              </dd>
            </div>
            <div>
              <dt>T0</dt>
              <dd>
                <Countdown to={r.closeAt} />
              </dd>
            </div>
          </>
        )}
      </dl>
      <div className="rcard-go">
        {r.status === "fired" ? (
          <>
            <Link className="link" href={`/certificate/${r.token}`}>
              Read the certificate
            </Link>
            <Link className="link quiet" href={href}>
              The round
            </Link>
          </>
        ) : r.status === "aborted" ? (
          <Link className="link" href={href}>
            Refunds
          </Link>
        ) : (
          <Link className="link" href={href}>
            {now < r.lockAt ? "Join this round" : "Watch it fire"}
          </Link>
        )}
      </div>
    </article>
  );
}
