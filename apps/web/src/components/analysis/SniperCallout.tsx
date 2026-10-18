import Link from "next/link";
import { explorerTx } from "@updraft/sdk";
import { Perch } from "@/components/landing/Bird";
import { hawkD } from "@/components/landing/birds";
import { int } from "@/components/landing/format";
import { SNIPE_ROUND, type SniperProof } from "./data";

/** Two perches to scale: the batch's price per token, and what the buyer right after paid. */
function Perches({ ratio }: { ratio: number }) {
  const w = 280,
    H = 150,
    base = H,
    unit = (H - 30) / Math.max(ratio, 1.5);
  const posts = [
    { x: 70, v: 1, l: "the batch" },
    { x: 200, v: ratio, l: "the buyer after" },
  ];
  return (
    <svg viewBox={`0 0 ${w} ${H + 28}`} aria-hidden="true">
      <line x1={0} y1={base} x2={w} y2={base} stroke="#231e19" strokeWidth={1.5} />
      {posts.map((p, i) => {
        const t = base - p.v * unit;
        return (
          <g key={p.l}>
            <line x1={p.x} y1={base} x2={p.x} y2={t} stroke="#231e19" strokeWidth={3} strokeLinecap="round" />
            <line x1={p.x - (i ? 12 : 34)} y1={t} x2={p.x + (i ? 12 : 34)} y2={t} stroke="#231e19" strokeWidth={2} strokeLinecap="round" />
            {i === 0 ? (
              [-26, -13, 0, 13, 26].map((dx, k) => <Perch key={dx} x={p.x + dx} y={t - 0.5} w={11} fill={k === 2 ? "#2e4527" : "#231e19"} flip={k % 2 === 1} />)
            ) : (
              <path d={hawkD()} fill="#2e4527" transform={`translate(${p.x} ${t - 14}) scale(11)`} />
            )}
            <text x={p.x} y={base + 20} fontSize={13} fill="#4f463b" textAnchor="middle">
              {p.l}
            </text>
            <text x={p.x + (i ? 18 : 40)} y={t + (i ? 16 : -4)} fontSize={13} fontWeight={600} fill="#231e19">
              {i ? `${ratio.toFixed(2)}×` : "1×"}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function SniperCallout({ proof }: { proof: SniperProof | null }) {
  return (
    <aside className="callout" aria-labelledby="h-live">
      {proof && (
        <div className="callout-art">
          <Perches ratio={proof.ratio} />
          <p className="cap">
            <b>Fig. 3.</b> Price per token, drawn to scale. Live on Elysium testnet.
          </p>
        </div>
      )}
      <div className="callout-body">
        <p className="who">The other side of it, live</p>
        <h3 className="h4" id="h-live">
          On Updraft, the hawk is the one who pays more.
        </h3>
        {proof ? (
          <p>
            Our rehearsal round <b>${proof.round.symbol}</b> fired at T0. {proof.secondsAfter} seconds later a buyer spent{" "}
            {int(proof.sniperQuote)} USDC on Ascend, with the launch fee still at {proof.feePct.toFixed(1)}%. Everyone in the batch got{" "}
            {int(proof.batchPerUsdc)} tokens per USDC; the buyer after got {int(proof.sniperPerUsdc)}, <b>{proof.ratio.toFixed(2)}× fewer</b>.
          </p>
        ) : (
          <p>
            Our rehearsal round fired at T0, and a buyer who spent 100 USDC right after it got far fewer tokens per USDC than everyone
            in the batch. The live figures load from the indexer.
          </p>
        )}
        <p className="callout-links">
          <Link className="link" href={`/rounds/${SNIPE_ROUND}`}>
            Read the round
          </Link>
          {proof && (
            <a className="link" href={explorerTx(proof.tx)} target="_blank" rel="noreferrer">
              The buyer&apos;s transaction
            </a>
          )}
        </p>
      </div>
    </aside>
  );
}
