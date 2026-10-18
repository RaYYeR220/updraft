import { explorerTx } from "@updraft/sdk";
import { Perch } from "./Bird";
import type { Plate } from "./data";
import { day, dollars, pct, priceFromX96, short, span, usdc } from "./format";

/** The settled wire: one bird per participant (or per few, for big rounds). */
function WireArt({ birds, marks }: { birds: number; marks: { i: number; label: string; fill: string }[] }) {
  const w = 560,
    h = 120,
    y0 = 86,
    x0 = 12,
    x1 = w - 12;
  const spanX = x1 - x0 - 16,
    Y = (x: number) => {
      const u = (x - w / 2) / (w / 2);
      return y0 - 10 + 9 * (1 - u * u);
    };
  const at = (i: number) => x0 + 8 + (spanX * (i + 0.5)) / birds;
  const size = birds <= 8 ? 14 : 10;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMax meet">
      {[x0 - 2, x1 + 2].map((px) => (
        <g key={px}>
          <line x1={px} y1={y0 - 30} x2={px} y2={h} stroke="#231e19" strokeWidth={2.4} />
          <line x1={px - 12} y1={y0 - 14} x2={px + 12} y2={y0 - 14} stroke="#231e19" strokeWidth={1.6} />
        </g>
      ))}
      <path d={`M${x0 - 2} ${y0 - 10} Q ${w / 2} ${y0 + 8} ${x1 + 2} ${y0 - 10}`} fill="none" stroke="#231e19" strokeWidth={1.2} />
      {Array.from({ length: birds }, (_, i) => {
        const x = at(i),
          m = marks.find((k) => k.i === i);
        return <Perch key={i} x={x} y={Y(x) + 0.6} w={size} fill={m?.fill ?? "#231e19"} flip={(i * 13) % 7 === 3} />;
      })}
      {marks.map((m) => (
        <g key={m.label}>
          <text className="it" x={at(m.i)} y={26} fontSize={14} fill="#4f463b" textAnchor="middle">
            {m.label}
          </text>
          <line x1={at(m.i)} y1={32} x2={at(m.i)} y2={50} stroke="#4f463b" />
        </g>
      ))}
    </svg>
  );
}

function Seal() {
  return (
    <svg className="seal" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <path id="seal-ring" d="M32 32 m-23 0 a23 23 0 1 1 46 0 a23 23 0 1 1 -46 0" />
      </defs>
      <circle cx="32" cy="32" r="30" fill="none" stroke="#2e4527" strokeWidth="1" />
      <circle cx="32" cy="32" r="16" fill="#c7d83b" stroke="#2e4527" strokeWidth="1" />
      <text fontSize="6.6" fontWeight="600" fill="#2e4527" letterSpacing="1.1">
        <textPath href="#seal-ring">ONE WIRE · ONE PRICE · ONE WIRE · ONE PRICE ·</textPath>
      </text>
      <path d="M22 34 L29 28.5 L32 31.5 L35 28.5 L42 34 L35 31.6 L32 35.2 L29 31.6 Z" fill="#231e19" />
    </svg>
  );
}

function vesting(v: { tgeBps: number; cliff: number; duration: number }) {
  const parts = [];
  if (v.tgeBps > 0) parts.push(`${pct(v.tgeBps)} at T0`);
  if (v.cliff > 0) parts.push(`cliff ${span(v.cliff)}`);
  if (v.duration > 0) parts.push(`then ${span(v.duration)} linear`);
  return parts.join(", ") || "none";
}

export function Certificate({ plate }: { plate: Plate | null }) {
  if (!plate) return <ExampleCertificate />;
  const d = plate.data;
  const n = d.participants;
  const birds = Math.min(40, Math.max(1, n));
  const per = Math.ceil(n / birds);
  const devShare = BigInt(d.creatorTokens) > BigInt(0);
  return (
    <article className="cert" aria-label={`Launch certificate for ${plate.name}`}>
      <div className="cert-top">
        <p className="cap">Updraft launch certificate</p>
        <p className="cap">
          <b className="num">Plate No. {String(plate.plateNo).padStart(4, "0")}</b>
        </p>
      </div>
      <h3 className={plate.name.length > 14 ? "long" : undefined}>
        {plate.name}
        <small>${plate.symbol}</small>
      </h3>
      <p className="cap bin">
        Fired {day(d.firedAt)} in one transaction{plate.rehearsal ? ", a rehearsal on Elysium testnet" : ""}
      </p>
      <div className="cert-art" aria-hidden="true">
        <WireArt birds={birds} marks={birds > 1 ? [{ i: 0, label: `top 1: ${pct(d.top1Bps)}`, fill: "#2e4527" }] : []} />
      </div>
      <dl className="facts">
        <div>
          <dt>Participants</dt>
          <dd className="num">
            {n} {plate.mode === 1 ? "verified Hyperliquid accounts" : n === 1 ? "wallet" : "wallets"}
          </dd>
        </div>
        <div>
          <dt>Everyone&apos;s price</dt>
          <dd className="num">{dollars(priceFromX96(d.avgPriceX96))}</dd>
        </div>
        <div>
          <dt>Raised</dt>
          <dd className="num">{usdc(d.quoteUsed)} USDC</dd>
        </div>
        <div>
          <dt>Concentration</dt>
          <dd className="num">
            top 1: {pct(d.top1Bps)}, top 10: {pct(d.top10Bps)}
          </dd>
        </div>
        <div>
          <dt>Dev&apos;s vesting</dt>
          <dd>{devShare ? vesting(d.creatorVesting) : "the dev took no share"}</dd>
        </div>
        <div>
          <dt>Shortfall</dt>
          <dd className="num">{BigInt(d.shortfall) === BigInt(0) ? "none" : `${usdc(d.shortfall)} USDC`}</dd>
        </div>
        <div>
          <dt>Policy hash</dt>
          <dd className="mono">{short(d.policyHash)}</dd>
        </div>
        <div>
          <dt>Record</dt>
          <dd className="mono">
            <a href={explorerTx(plate.tx)} target="_blank" rel="noreferrer">
              {short(plate.tx)}
            </a>
          </dd>
        </div>
      </dl>
      <div className="cert-foot">
        <span className="chip ex">{plate.rehearsal ? "Rehearsal, read from the chain" : "Read from the chain"}</span>
        <Seal />
      </div>
      {per > 1 && <p className="cap cert-note">One bird per {per} participants.</p>}
    </article>
  );
}

/** Shown only when the indexer can't be reached; every value on it is an example. */
function ExampleCertificate() {
  return (
    <article className="cert" aria-label="Example launch certificate">
      <div className="cert-top">
        <p className="cap">Updraft launch certificate</p>
        <p className="cap">
          <b className="num">Plate No. 0007</b>
        </p>
      </div>
      <h3>
        Starling<small>$STRL</small>
      </h3>
      <p className="cap bin">
        <i>Sturnus updraftii</i>, fired at T0 in one transaction
      </p>
      <div className="cert-art" aria-hidden="true">
        <WireArt
          birds={40}
          marks={[
            { i: 6, label: "the dev", fill: "#2e4527" },
            { i: 22, label: "you", fill: "#c7d83b" },
          ]}
        />
      </div>
      <dl className="facts">
        <div>
          <dt>Participants</dt>
          <dd className="num">160 Hyperliquid accounts</dd>
        </div>
        <div>
          <dt>Everyone&apos;s price</dt>
          <dd className="num">$0.0001094</dd>
        </div>
        <div>
          <dt>Concentration</dt>
          <dd className="num">top 1: 4.8%, top 10: 19.6%</dd>
        </div>
        <div>
          <dt>Dev&apos;s vesting</dt>
          <dd>30-day cliff, then 90 days linear</dd>
        </div>
        <div>
          <dt>Fee policy</dt>
          <dd className="num">bid 30, stakers 30, team 30, platform 10</dd>
        </div>
        <div>
          <dt>Record</dt>
          <dd className="mono">0x7f3a…e1c9</dd>
        </div>
      </dl>
      <div className="cert-foot">
        <span className="chip ex">Example certificate</span>
        <Seal />
      </div>
    </article>
  );
}
