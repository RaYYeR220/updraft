import { Certificate } from "./Certificate";
import { PolicyChart, VestChart } from "./charts";
import type { Plate } from "./data";

export function Guarantees({ plate }: { plate: Plate | null }) {
  return (
    <section className="sec" id="guarantees" aria-labelledby="h-g">
      <div className="wrap">
        <div className="sec-head">
          <div className="sec-title">
            <p className="plate-no">
              <b>IV</b>Field marks
            </p>
            <h2 className="h2" id="h-g">
              Four marks of a fair launch, written into the contracts.
            </h2>
          </div>
          <p className="lede">
            A field guide tells species apart by marks you can check. These are the ones every Updraft round carries, and none of them
            depends on trusting the dev.
          </p>
        </div>

        <div className="marks">
          <div className="mark-list">
            <div className="fm">
              <h3 className="h4">
                Vesting in public <em>the dev&apos;s share</em>
              </h3>
              <p>
                The dev commits like everyone else. Their tokens unlock on a schedule set before the round opens: nothing until the cliff,
                then a straight line. Anyone can see how much has unlocked.
              </p>
              <VestChart />
              <p className="cap fm-cap">Example schedule: a 30-day cliff, then 90 days linear.</p>
            </div>
            <div className="fm">
              <h3 className="h4">
                Fees by policy <em>bounded, timelocked</em>
              </h3>
              <p>
                Ascend&apos;s creator role is held by a vault, not a wallet. A published policy splits creator fees between Ascend&apos;s own
                buy-support bid, holders who stake the token in the vault, the team and the platform. The split can only move inside bounds
                fixed at launch, and only after a timelock.
              </p>
              <PolicyChart />
              <p className="cap fm-cap">
                Example policy. Bounds fixed at launch: bid 20 to 50%, stakers 20 to 50%, team 10 to 40%, platform 10%. While nobody is
                staked, the stakers&apos; share goes to the bid.
              </p>
            </div>
            <div className="fm">
              <h3 className="h4">
                Fail-safe refunds <em>no half-launches</em>
              </h3>
              <p>If the round can&apos;t fire cleanly, it doesn&apos;t fire. Everyone gets back their share of what the round holds.</p>
              <ul className="fails">
                <li>
                  <span>if</span>the minimum isn&apos;t reached
                </li>
                <li>
                  <span>if</span>the deadline passes
                </li>
                <li>
                  <span>if</span>Ascend&apos;s curve or quote changes
                </li>
                <li>
                  <span>if</span>the launchpad is retired
                </li>
              </ul>
              <p className="cap fm-cap">While Ascend is paused, the round waits to fire.</p>
            </div>
            <div className="fm">
              <h3 className="h4">
                The certificate <em>one plate per launch</em>
              </h3>
              <p>
                Every launch writes an on-chain record: who took part, how concentrated the batch is, the dev&apos;s vesting, the policy
                hash (fees, exit and listing) and any shortfall.{" "}
                {plate
                  ? "The plate here is the record our first rehearsal round wrote."
                  : "It reads like the example plate shown here."}
              </p>
            </div>
          </div>

          <div className="cert-col">
            <Certificate plate={plate} />
          </div>
        </div>
      </div>
    </section>
  );
}
