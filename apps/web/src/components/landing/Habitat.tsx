import Link from "next/link";
import { ParityChart, RouteChart } from "./charts";

function Leg({ name, lo, hi, at, fixed = false }: { name: string; lo?: number; hi?: number; at: number; fixed?: boolean }) {
  return (
    <div className="legrow">
      <span>{name}</span>
      <div className={fixed ? "range fixed" : "range"}>
        {lo !== undefined && hi !== undefined && <span className="b" style={{ left: `${lo}%`, width: `${hi - lo}%` }} />}
        <span className="k" style={{ left: `${at}%` }} />
      </div>
      <span className="v">{at}%</span>
    </div>
  );
}

export function Habitat() {
  return (
    <section className="sec" id="creators" aria-labelledby="h-c">
      <div className="wrap">
        <div className="sec-head">
          <div className="sec-title">
            <p className="plate-no">
              <b>V</b>Habitat
            </p>
            <h2 className="h2" id="h-c">
              Good for the people launching, and for the place they launch.
            </h2>
          </div>
          <p className="lede">
            Creators get a launch with a crowd instead of a race. Ascend gets launches that start wide, and keeps every fee it would have
            earned.
          </p>
        </div>

        <div className="two">
          <article className="side creators">
            <p className="who">For creators</p>
            <h3 className="h3">Launch to a crowd, not a race.</h3>
            <p>
              Set up the round in Creator Studio: token details, commit window, raise bounds, Open or Verified mode, your vesting, your fee
              policy and its bounds. After launch, the console shows harvests, queued policy changes, vault flows and staker stats.
            </p>
            <div className="studio" aria-label="Creator Studio, fee policy step (illustration)">
              <div className="studio-top">
                <b>Creator Studio</b>
                <div className="steps" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i className="now" />
                  <i className="todo" />
                </div>
              </div>
              <h4>
                Fee policy <span>The bounds lock at launch. Moves inside them wait out the timelock.</span>
              </h4>
              <Leg name="Ascend's bid" lo={20} hi={50} at={30} />
              <Leg name="Stakers" lo={20} hi={50} at={30} />
              <Leg name="Team" lo={10} hi={40} at={30} />
              <Leg name="Platform" at={10} fixed />
              <div className="studio-foot">
                <span>Timelock: 72 h (example)</span>
                <Link className="mini-btn" href="/studio">
                  Open Creator Studio
                </Link>
              </div>
            </div>
            <div className="side-cta">
              <Link className="btn" href="/studio">
                Launch with Updraft
              </Link>
            </div>
          </article>

          <article className="side ascend">
            <p className="who">For Ascend</p>
            <h3 className="h3">Built on Ascend, and square with it.</h3>
            <p>
              Updraft uses Ascend&apos;s own launch: its curve, its creator role, its bid. The fee-free launch buy is paid back, and the
              distribution it leaves is the kind Ascend&apos;s lifecycle is built for.
            </p>
            <div className="parity">
              <h4>Fee parity</h4>
              <p>1% of each batch funds Ascend&apos;s own bid, so Ascend loses nothing to the fee-free buy.</p>
              <div className="parity-art" aria-hidden="true">
                <ParityChart />
              </div>
            </div>
            <div className="route">
              <h4>Ascended-ready distribution</h4>
              <p>Every launch starts with a crowd of holders who all paid one price, ready for Ascend&apos;s road from launch to HyperCore.</p>
              <div className="route-art" aria-hidden="true">
                <RouteChart />
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
