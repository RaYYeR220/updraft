import type { Metadata } from "next";
import Link from "next/link";
import { createPublicClient, http } from "viem";
import { isRehearsal, usdc } from "@/components/round/format";
import { roundNumbers } from "@/components/round/registry";
import { RoundCard, type Shelf, shelfOf } from "@/components/rounds/RoundCard";
import { RPC_URL, chain } from "@/lib/config";
import { indexer } from "@/lib/data";
import "@/styles/rounds.css";

export const metadata: Metadata = {
  title: "Rounds",
  description: "Every Updraft round on Ascend: live, upcoming, fired and aborted, with what each one raised and the price everyone paid.",
};

export const revalidate = 5;

const SHELVES: { key: Shelf; title: string; cap: string; empty: React.ReactNode }[] = [
  {
    key: "live",
    title: "Live",
    cap: "Open for commits, locked, or waiting for someone to fire them at T0.",
    empty: (
      <>
        No round is taking commits right now. Creators open rounds from the{" "}
        <Link className="link" href="/studio">
          Creator Studio
        </Link>
        .
      </>
    ),
  },
  {
    key: "upcoming",
    title: "Upcoming",
    cap: "Created, with their rules fixed, but not open yet.",
    empty: "Nothing scheduled. A new round shows here as soon as its creator sets it up.",
  },
  {
    key: "fired",
    title: "Fired",
    cap: "Launched on Ascend in one transaction. Each one wrote a certificate on-chain.",
    empty: "No round has fired yet.",
  },
  {
    key: "aborted",
    title: "Aborted",
    cap: "Closed without launching. Every commit in them is refundable.",
    empty: "None. No round has had to refund its commits.",
  },
];

export default async function RoundsPage() {
  const [rows, stats, numbers] = await Promise.all([
    indexer.rounds(),
    indexer.stats(),
    roundNumbers(createPublicClient({ chain, transport: http(RPC_URL) })).catch(() => null),
  ]);
  const now = Math.floor(Date.now() / 1000);
  const all = rows ?? [];
  const numbered = all.map((r) => ({ r, no: numbers?.get(r.id.toLowerCase()) ?? null }));
  const byShelf = (s: Shelf) =>
    numbered
      .filter(({ r }) => shelfOf(r, now) === s)
      .sort((a, b) =>
        s === "fired" ? (b.r.firedAt ?? 0) - (a.r.firedAt ?? 0) : s === "aborted" ? b.r.createdAt - a.r.createdAt : a.r.closeAt - b.r.closeAt,
      );

  return (
    <main className="rl">
      <header className="rl-head">
        <div>
          <p className="cap">Updraft field guide: the rounds</p>
          <h1 className="h2">Every round, one price for everyone in it.</h1>
        </div>
        <div className="rl-lede">
          <p className="lede">
            Join a live round before its lock and withdraw any time until then. At T0 the whole pot becomes Ascend's launch buy, and every wallet in
            it, the creator's included, pays the same average price.
          </p>
          {stats && (
            <dl className="rl-stats">
              <div>
                <dt>rounds</dt>
                <dd>{stats.rounds}</dd>
              </div>
              <div>
                <dt>fired</dt>
                <dd>{stats.fired}</dd>
              </div>
              <div>
                <dt>USDC launched</dt>
                <dd>{usdc(stats.quoteLaunched)}</dd>
              </div>
              <div>
                <dt>participants</dt>
                <dd>{stats.participants}</dd>
              </div>
            </dl>
          )}
        </div>
      </header>

      {rows === null && (
        <section className="rl-down" role="alert">
          <h2 className="h4">The round index didn't answer</h2>
          <p>
            This list comes from Updraft's indexer, which is unreachable right now. The rounds themselves live on Elysium and are unaffected; try
            again shortly.
          </p>
        </section>
      )}

      {rows !== null &&
        SHELVES.map((s) => {
          const list = byShelf(s.key);
          if (!list.length && (s.key === "upcoming" || s.key === "aborted")) return null;
          return (
            <section key={s.key} className={`shelf ${s.key}`} aria-labelledby={`shelf-${s.key}`}>
              <div className="shelf-head">
                <h2 id={`shelf-${s.key}`} className="h3">
                  {s.title}
                  <span className="count">{list.length}</span>
                </h2>
                <p className="cap">{s.cap}</p>
              </div>
              {list.length ? (
                <div className="rcards">
                  {list.map(({ r, no }) => (
                    <RoundCard key={r.id} r={r} no={no} now={now} />
                  ))}
                </div>
              ) : (
                <p className="shelf-empty">{s.empty}</p>
              )}
            </section>
          );
        })}

      {all.some((r) => isRehearsal(r.creator, r.name)) && (
        <p className="cap rl-note">
          Rounds marked as rehearsals were run by the Updraft team on Elysium testnet to exercise the full path: commit, fire, land and claim.
        </p>
      )}
    </main>
  );
}
