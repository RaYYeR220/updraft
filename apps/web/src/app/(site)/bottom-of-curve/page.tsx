import type { Metadata } from "next";
import { explorerAddress } from "@updraft/sdk";
import { API_URL } from "@/lib/config";
import { headline, loadAnalysis, loadSniper } from "@/components/analysis/data";
import { LaunchTable } from "@/components/analysis/LaunchTable";
import { PremiumChart } from "@/components/analysis/PremiumChart";
import { ShareChart } from "@/components/analysis/ShareChart";
import { SniperCallout } from "@/components/analysis/SniperCallout";
import { day, int, pct, short, times, utc } from "@/components/landing/format";
import "@/styles/landing.css";
import "@/styles/analysis.css";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Bottom of the curve",
  description:
    "Every launch on Ascend's testnet, read from the chain: how much of each token the creator side bought in its first minute, and what the next buyer paid.",
};

export default async function BottomOfCurve() {
  const [a, proof] = await Promise.all([loadAnalysis(), loadSniper()]);

  if (!a || a.launches.length === 0) {
    return (
      <main className="fg boc">
        <section className="sec boc-head">
          <div className="wrap">
            <p className="plate-no">
              <b>I</b>The survey
            </p>
            <h1 className="display">Who got the bottom of the curve.</h1>
            <p className="lede">
              The analysis service didn&apos;t answer just now, so there is nothing to draw. The raw data lives at{" "}
              <a className="link" href={`${API_URL}/analysis`}>
                {API_URL}/analysis
              </a>
              , and the run can be reproduced with <code>pnpm --filter @updraft/analysis start</code>.
            </p>
          </div>
        </section>
      </main>
    );
  }

  const h = headline(a);
  const s = a.summary;
  const block = int(h.block);
  const blockTime = Math.floor(new Date(a.generatedAtBlockTime).getTime() / 1000);
  const ordered = [...a.launches].sort((x, y) => x.launchedAt - y.launchedAt);
  const sharePoints = ordered.map((l) => ({
    token: l.token,
    at: l.launchedAt,
    share: l.insiderShareBps,
    dev: l.devBuyShareBps,
    premium: l.nextBuyerPremium,
  }));
  const premiumPoints = a.launches
    .filter((l): l is typeof l & { nextBuyerPremium: number } => l.nextBuyerPremium !== null)
    .map((l) => ({ token: l.token, premium: l.nextBuyerPremium, dev: l.devBuyShareBps }));
  const steep = premiumPoints.filter((p) => p.premium >= 5);
  const steepMinDev = steep.length ? Math.min(...steep.map((p) => p.dev)) : 0;
  const zeros = a.launches.filter((l) => l.insiderShareBps === 0).length;
  const perPad = a.launchpads.map((p) => ({ p, n: a.launches.filter((l) => l.launchpad.toLowerCase() === p.toLowerCase()).length }));
  const first = ordered[0].launchedAt,
    last = ordered[ordered.length - 1].launchedAt;

  return (
    <main className="fg boc">
      <section className="sec boc-head" aria-labelledby="h-boc">
        <div className="wrap">
          <div className="sec-head">
            <div className="sec-title">
              <p className="plate-no">
                <b>I</b>The survey
              </p>
              <h1 className="display" id="h-boc">
                Who got the bottom of the curve.
              </h1>
            </div>
            <p className="lede">
              Every launch on Ascend&apos;s testnet, read from the chain up to block {block}: how much of each token the creator side
              bought in its first {a.windowSeconds} seconds, and what the next buyer paid for it.
            </p>
          </div>

          <div className="plate kpis">
            <div className="kpi-row">
              <div className="kpi">
                <p className="fig-num">{h.withDevBuy}</p>
                <h2>launches opened with a dev-buy</h2>
                <p className="cap">of {int(h.launches)}, the creator buying first in the launch transaction</p>
              </div>
              <div className="kpi">
                <p className="fig-num">{h.over20}</p>
                <h2>where the creator side took over 20% of supply</h2>
                <p className="cap">dev-buy, own buys and wallets it funded, in the first minute</p>
              </div>
              <div className="kpi">
                <p className="fig-num">
                  {Math.round(h.worst.insiderShareBps / 100)}
                  <small>%</small>
                </p>
                <h2>of supply to the creator side in the worst case</h2>
                <p className="cap">
                  token{" "}
                  <a className="mono" href={explorerAddress(h.worst.token)} target="_blank" rel="noreferrer">
                    {short(h.worst.token)}
                  </a>
                  , {pct(h.worst.insiderShareBps)} exactly
                </p>
              </div>
              <div className="kpi">
                <p className="fig-num">
                  {(Math.round(h.maxPremium * 10) / 10).toString()}
                  <small>×</small>
                </p>
                <h2>what the next buyer paid against the dev&apos;s average, at the steepest</h2>
                <p className="cap">after a dev-buy of {pct(h.top.devBuyShareBps)} of supply</p>
              </div>
            </div>
            <dl className="kpi-sub">
              <div>
                <dt>Launches read</dt>
                <dd>{int(s.launches)}</dd>
              </div>
              <div>
                <dt>Creator side over 5%</dt>
                <dd>{int(s.launchesInsidersOver5Pct)}</dd>
              </div>
              <div>
                <dt>Any outside buyer in the first minute</dt>
                <dd>{int(s.launchesWithOutsideBuyers)}</dd>
              </div>
              <div>
                <dt>Median next-buyer premium</dt>
                <dd>{s.medianNextBuyerPremium !== null ? times(s.medianNextBuyerPremium) : "n/a"}</dd>
              </div>
            </dl>
            <div className="src">
              <p className="cap">
                Source: <b>Ascend testnet, {int(s.launches)} launches up to block {block}</b>, {day(first)} to {day(last)}.
              </p>
              <a className="cap-link" href={`${API_URL}/analysis`}>
                The raw data, as JSON
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="sec" id="share" aria-labelledby="h-share">
        <div className="wrap">
          <div className="sec-head">
            <div className="sec-title">
              <p className="plate-no">
                <b>II</b>The early bird
              </p>
              <h2 className="h2" id="h-share">
                Launch by launch, the share that went to the creator side.
              </h2>
            </div>
            <p className="lede">
              On most launches the creator side bought next to nothing: the median is {pct(s.medianInsiderShareBps)}, and {zeros} saw no
              creator-side buying at all. The damage sits in the tail: {int(s.launchesInsidersOver5Pct)} launches above 5%, {h.over20}{" "}
              above a fifth of supply.
            </p>
          </div>
          <div className="plate chart-plate">
            <ShareChart points={sharePoints} windowSeconds={a.windowSeconds} />
          </div>
        </div>
      </section>

      <section className="sec" id="premium" aria-labelledby="h-premium">
        <div className="wrap">
          <div className="sec-head">
            <div className="sec-title">
              <p className="plate-no">
                <b>III</b>The next perch
              </p>
              <h2 className="h2" id="h-premium">
                What the next buyer paid.
              </h2>
            </div>
            <p className="lede">
              A dev-buy moves the price before anyone else can buy. We compare the price right after it with the dev&apos;s own average
              price. Small dev-buys barely move it; the big ones leave the next buyer paying several times more.
            </p>
          </div>
          <div className="plate chart-plate">
            <PremiumChart points={premiumPoints} />
            <p className="cap chart-note">
              <b>Fig. 2.</b> One bird per launch with a dev-buy, {premiumPoints.length} in all, over what the next buyer paid against the
              dev&apos;s average price. Median {s.medianNextBuyerPremium !== null ? times(s.medianNextBuyerPremium) : "n/a"}.
              {steep.length > 0 &&
                ` In ${steep.length} launches the next buyer paid 5× or more; every one of them opened with a dev-buy of at least ${pct(steepMinDev)} of supply.`}
            </p>
          </div>
          <SniperCallout proof={proof} />
        </div>
      </section>

      <section className="sec" id="ledger" aria-labelledby="h-ledger">
        <div className="wrap">
          <div className="sec-head">
            <div className="sec-title">
              <p className="plate-no">
                <b>IV</b>The ledger
              </p>
              <h2 className="h2" id="h-ledger">
                The launches where the creator side took the most.
              </h2>
            </div>
            <p className="lede">
              Each row links to the token and its launch transaction on the Elysium explorer, so every number here can be checked by hand.
            </p>
          </div>
          <LaunchTable launches={a.launches} launchpads={a.launchpads} />
        </div>
      </section>

      <section className="sec" id="method" aria-labelledby="h-method">
        <div className="wrap">
          <div className="sec-head">
            <div className="sec-title">
              <p className="plate-no">
                <b>V</b>Method
              </p>
              <h2 className="h2" id="h-method">
                How it was counted, and how to count it again.
              </h2>
            </div>
            <p className="lede">
              The run is deterministic for a pinned block. Point it at block {block} and you get the same {int(s.launches)} launches and
              the same numbers.
            </p>
          </div>
          <div className="method">
            <ol className="notes">
              {a.method.map((m, i) => (
                <li key={i}>
                  <span className="note-no">{String.fromCharCode(97 + i)}</span>
                  <p>{m}</p>
                </li>
              ))}
            </ol>
            <div className="repro">
              <h3 className="h4">Reproduce it</h3>
              <pre>
                <code>
                  <span className="dim">$ </span>TO_BLOCK={h.block} pnpm --filter @updraft/analysis start
                </code>
              </pre>
              <dl className="pins">
                <div>
                  <dt>Pinned block</dt>
                  <dd className="num">
                    {block}, {utc(blockTime)}
                  </dd>
                </div>
                <div>
                  <dt>Window</dt>
                  <dd>first {a.windowSeconds} seconds after each launch</dd>
                </div>
                {perPad.map(({ p, n }, i) => (
                  <div key={p}>
                    <dt>Launchpad {i + 1}</dt>
                    <dd>
                      <a className="mono" href={explorerAddress(p)} target="_blank" rel="noreferrer">
                        {short(p)}
                      </a>
                      , {n} launches
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="cap">
                The output is served as JSON at{" "}
                <a className="cap-link" href={`${API_URL}/analysis`}>
                  /analysis
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
