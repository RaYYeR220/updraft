import Link from "next/link";
import { Perch } from "./Bird";

/** Every round that fires feeds one basket. */
function RoostArt() {
  const w = 440,
    h = 260,
    ys = [38, 100, 162, 224],
    nx = 352,
    ny = 131;
  return (
    <svg viewBox={`0 0 ${w} ${h}`}>
      {ys.map((y, i) => (
        <g key={y}>
          <path d={`M122 ${y} C 210 ${y}, ${nx - 110} ${ny}, ${nx - 56} ${ny}`} fill="none" stroke="rgba(199,216,59,.6)" strokeWidth={1.4} />
          <line x1={8} y1={y} x2={114} y2={y} stroke="#b8c0a3" strokeWidth={1.2} />
          {Array.from({ length: 6 }, (_, k) => (
            <Perch key={k} x={18 + k * 17} y={y - 0.4} w={10} fill="#ece6cf" flip={(k + i) % 4 === 1} />
          ))}
        </g>
      ))}
      <circle cx={nx} cy={ny} r={56} fill="none" stroke="#c7d83b" strokeWidth={1.5} />
      <circle cx={nx} cy={ny} r={46} fill="rgba(199,216,59,.14)" />
      <text className="serif" x={nx} y={ny + 6} fontSize={19} fontWeight={500} fill="#ece6cf" textAnchor="middle">
        basket
      </text>
      <text x={nx} y={ny + 80} fontSize={13} fill="#b8c0a3" textAnchor="middle">
        $DRAFT stakers
      </text>
    </svg>
  );
}

export function Roost() {
  return (
    <section className="sec draft" id="draft" aria-labelledby="h-d">
      <div className="wrap">
        <div className="sec-head">
          <div className="sec-title">
            <p className="plate-no">
              <b>VI</b>The roost
            </p>
            <h2 className="h2" id="h-d">
              Stake $DRAFT and share the platform basket.
            </h2>
          </div>
          <p className="lede">
            $DRAFT is Updraft&apos;s own token. The platform&apos;s cut of every launch goes into one basket, and $DRAFT stakers share it,
            epoch by epoch.
          </p>
        </div>
        <div className="earn">
          <div className="e">
            <div className="big">
              0.5<small>%</small>
            </div>
            <h3>of every launch&apos;s tokens</h3>
            <p>At T0, half a percent of the tokens each batch buys goes into the basket.</p>
          </div>
          <div className="e">
            <div className="big">
              10<small>%</small>
            </div>
            <h3>of every vault&apos;s creator fees</h3>
            <p>Each launch&apos;s vault sends the platform&apos;s share of its creator fees to the basket, as they are harvested.</p>
          </div>
          <div className="flow" aria-hidden="true">
            <RoostArt />
            <p className="cap">Every round that fires feeds the basket.</p>
          </div>
        </div>
        <ol className="epoch" aria-label="How the basket is paid">
          <li>
            <span className="step-no">1</span>
            <h3>Stake</h3>
            <p>The staking contract holds only your principal. It keeps no reward accounting, so there is nothing that could freeze it.</p>
          </li>
          <li>
            <span className="step-no">2</span>
            <h3>An epoch closes</h3>
            <p>A Merkle root is published over time-weighted stake. Anyone can recompute it from public events.</p>
          </li>
          <li>
            <span className="step-no">3</span>
            <h3>Claim with a proof</h3>
            <p>Each staker claims their part of the epoch&apos;s basket with a Merkle proof.</p>
          </li>
        </ol>
        <div className="draft-cta">
          <Link className="btn on-forest" href="/stake">
            Stake $DRAFT
          </Link>
          <Link className="link" href="/docs">
            How epochs work
          </Link>
        </div>
      </div>
    </section>
  );
}
