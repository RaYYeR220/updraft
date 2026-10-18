import { explorerAddress, explorerTx } from "@updraft/sdk";
import { pct, short, times, utc } from "@/components/landing/format";
import type { Launch } from "./data";

function Share({ bps }: { bps: number }) {
  return (
    <span className="share">
      <span className="share-track" aria-hidden="true">
        <i style={{ width: `${Math.max(bps > 0 ? 1.5 : 0, bps / 100)}%` }} className={bps > 2000 ? "over" : undefined} />
      </span>
      <span className="num">{pct(bps, true)}</span>
    </span>
  );
}

function Rows({ launches, from = 1, pads }: { launches: Launch[]; from?: number; pads?: Map<string, number> }) {
  return (
    <>
      {launches.map((l, i) => (
        <tr key={l.token}>
          <td className="rank num">{from + i}</td>
          <td>
            <a className="mono" href={explorerAddress(l.token)} target="_blank" rel="noreferrer">
              {short(l.token)}
            </a>
          </td>
          <td className="when num">{utc(l.launchedAt, false)}</td>
          {pads && <td className="pad num">{pads.get(l.launchpad.toLowerCase()) ?? "?"}</td>}
          <td className="num dev">{pct(l.devBuyShareBps, true)}</td>
          <td>
            <Share bps={l.insiderShareBps} />
          </td>
          <td className="num others">{pct(l.othersShareBps, true)}</td>
          <td className="num">{l.nextBuyerPremium !== null ? times(l.nextBuyerPremium) : <span className="none">no dev-buy</span>}</td>
          <td>
            <a className="mono" href={explorerTx(l.launchTx)} target="_blank" rel="noreferrer">
              {short(l.launchTx)}
            </a>
          </td>
        </tr>
      ))}
    </>
  );
}

function Head({ pads }: { pads?: boolean }) {
  return (
    <thead>
      <tr>
        <th scope="col" className="rank">
          #
        </th>
        <th scope="col">Token</th>
        <th scope="col" className="when">
          Launched (UTC)
        </th>
        {pads && <th scope="col">Pad</th>}
        <th scope="col" className="dev">
          Dev-buy
        </th>
        <th scope="col">Creator side</th>
        <th scope="col" className="others">
          Everyone else
        </th>
        <th scope="col">Next buyer paid</th>
        <th scope="col">Launch tx</th>
      </tr>
    </thead>
  );
}

/** The launches where the creator side took the most, and every launch behind a disclosure. */
export function LaunchTable({ launches, launchpads, top = 15 }: { launches: Launch[]; launchpads: string[]; top?: number }) {
  const ranked = [...launches].sort((a, b) => b.insiderShareBps - a.insiderShareBps || a.launchedAt - b.launchedAt);
  const pads = new Map(launchpads.map((p, i) => [p.toLowerCase(), i + 1]));
  return (
    <>
      <div className="ledger">
        <table>
          <caption className="sr">The {top} launches where the creator side bought the largest share of supply in the first minute</caption>
          <Head />
          <tbody>
            <Rows launches={ranked.slice(0, top)} />
          </tbody>
        </table>
      </div>
      <details className="all">
        <summary>
          Every launch, all {launches.length}, with its launchpad
          <span className="cap"> the table behind Fig. 1</span>
        </summary>
        <div className="ledger scroll" tabIndex={0} role="region" aria-label={`All ${launches.length} launches`}>
          <table>
            <caption className="sr">All {launches.length} launches, by creator-side share of supply</caption>
            <Head pads />
            <tbody>
              <Rows launches={ranked} pads={pads} />
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
