import { Perch } from "./Bird";
import { flyPath, hawkD, mulberry } from "./birds";

function Ital({ x, y, children, anchor = "start" }: { x: number; y: number; children: string; anchor?: "start" | "middle" | "end" }) {
  return (
    <text className="it" x={x} y={y} fontSize={15} fill="#6b5f4d" textAnchor={anchor}>
      {children}
    </text>
  );
}

/** A loose stream from the left gathers into a flock; one bird turns back (withdraw until the lock). */
function CommitArt() {
  const r = mulberry(7);
  const birds = Array.from({ length: 44 }, () => {
    const u = Math.pow(r(), 0.6),
      x = 22 + u * 360 + (r() - 0.5) * 30 * (1.2 - u),
      y = 160 - u * 50 + (r() - 0.5) * (26 + u * 66);
    const ang = -0.1 + (r() - 0.5) * 0.5,
      s = 2.4 + u * 2.6 + r() * 0.8,
      phi = -0.4 + r() * 1.4;
    return { d: flyPath(x, y, ang, s, phi), fill: u > 0.55 ? "#231e19" : "#6b5f4d" };
  });
  return (
    <svg viewBox="0 0 420 230" preserveAspectRatio="xMinYMax meet">
      {birds.map((b, i) => (
        <path key={i} d={b.d} fill={b.fill} />
      ))}
      <path d="M268 100 C 226 58, 176 46, 128 62" fill="none" stroke="#2e4527" strokeWidth={1.2} strokeDasharray="2 5" strokeLinecap="round" />
      <path d={flyPath(118, 66, Math.PI + 0.25, 5.4, 0.8)} fill="#c7d83b" stroke="#2e4527" strokeWidth={0.9} />
      <Ital x={70} y={32}>
        free to leave until the lock
      </Ital>
      <line x1={419} y1={14} x2={419} y2={230} stroke="#231e19" strokeWidth={1} strokeDasharray="3 4" />
    </svg>
  );
}

/** One buy at the bottom of Ascend's curve; a buyer right after pays the launch fee. */
function FireArt() {
  const Y0 = 229,
    curve = (x: number) => Y0 - 6 - 0.0021 * x * x - 0.08 * x;
  let d = `M0 ${curve(0)}`;
  for (let x = 0; x <= 250; x += 5) d += ` L${x} ${curve(x).toFixed(1)}`;
  const cut = 104;
  let a = `M0 ${Y0}`;
  for (let x = 0; x <= cut; x += 4) a += ` L${x} ${curve(x).toFixed(1)}`;
  a += ` L${cut} ${Y0} Z`;
  const avg = Y0 - 6 - (0.0021 * cut * cut) / 3 - (0.08 * cut) / 2;
  const hx = 182,
    hy = curve(182);
  return (
    <svg viewBox="0 0 260 230" preserveAspectRatio="xMinYMax meet">
      <path d={a} fill="rgba(199,216,59,.6)" />
      <path d={d} fill="none" stroke="#231e19" strokeWidth={2} strokeLinecap="round" />
      <line x1={0} y1={avg} x2={cut} y2={avg} stroke="#2e4527" strokeWidth={2} />
      {Array.from({ length: 6 }, (_, i) => (
        <Perch key={i} x={9 + i * 16.5} y={avg - 0.5} w={9.4} fill={i === 1 ? "#2e4527" : "#231e19"} flip={i % 3 === 1} />
      ))}
      <Ital x={4} y={avg - 44}>
        one buy, one price
      </Ital>
      <line x1={hx + 3} y1={hy - 4} x2={hx + 14} y2={hy - 34} stroke="#4f463b" strokeWidth={1} />
      <circle cx={hx} cy={hy} r={4.5} fill="#efe8d6" stroke="#231e19" strokeWidth={1.5} />
      <path d={hawkD()} fill="#2e4527" transform={`translate(${hx + 20} ${hy - 48}) scale(11)`} />
      <Ital x={256} y={24} anchor="end">
        right after: up to 90% fee
      </Ital>
    </svg>
  );
}

/** One wire, the dev's share unlocking under it. */
function LandArt() {
  const y = 92,
    Y = (x: number) => y + 10 * (1 - Math.pow((x - 196) / 196, 2));
  const n = 20,
    gap = 19.2;
  const by = 228,
    cl = 130,
    end = 392;
  return (
    <svg viewBox="0 0 400 230" preserveAspectRatio="xMinYMax meet">
      <path d={`M0 ${y} Q 196 ${y + 20} 392 ${y}`} fill="none" stroke="#231e19" strokeWidth={1.4} />
      {Array.from({ length: n }, (_, i) => {
        const x = 12 + i * gap;
        return <Perch key={i} x={x} y={Y(x) + 0.5} w={11.5} fill={i === 3 ? "#2e4527" : i === 13 ? "#c7d83b" : "#231e19"} flip={i % 5 === 3} />;
      })}
      <Ital x={12 + 3 * gap} y={44} anchor="middle">
        the dev
      </Ital>
      <line x1={12 + 3 * gap} y1={52} x2={12 + 3 * gap} y2={66} stroke="#4f463b" strokeWidth={1} />
      <Ital x={12 + 13 * gap} y={44} anchor="middle">
        you
      </Ital>
      <line x1={12 + 13 * gap} y1={52} x2={12 + 13 * gap} y2={70} stroke="#4f463b" strokeWidth={1} />
      <path d={`M0 ${by} L${cl} ${by} L${end} 150 L${end} ${by} Z`} fill="rgba(46,69,39,.12)" />
      <path d={`M0 ${by - 1} L${cl} ${by - 1} L${end} 150`} fill="none" stroke="#2e4527" strokeWidth={2} strokeLinejoin="round" />
      <circle cx={cl} cy={by - 1} r={4} fill="#2e4527" stroke="#efe8d6" strokeWidth={2} />
      <text x={cl - 8} y={by - 12} fontSize={13} fill="#4f463b" textAnchor="end">
        cliff
      </text>
      <text x={end - 6} y={140} fontSize={13} fill="#4f463b" textAnchor="end">
        the dev&apos;s share, unlocking
      </text>
    </svg>
  );
}

export function How() {
  return (
    <section className="sec" id="how" aria-labelledby="h-how">
      <div className="wrap">
        <div className="sec-head">
          <div className="sec-title">
            <p className="plate-no">
              <b>III</b>Behaviour
            </p>
            <h2 className="h2" id="h-how">
              Commit, fire, land. Three moves, one price.
            </h2>
          </div>
          <p className="lede">
            A round gathers before launch, buys once at T0, and lands tokens in every wallet together. The dev is in the flock, not ahead of
            it.
          </p>
        </div>

        <div className="flight">
          <article className="step">
            <div className="ill" aria-hidden="true">
              <CommitArt />
              <span className="tick">Round opens</span>
              <span className="tick r">Lock: withdrawals stop</span>
            </div>
            <div className="step-body">
              <span className="step-no">1</span>
              <h3 className="h3">Commit</h3>
              <p>Before launch, anyone puts USDC into the round. Change your mind? Withdraw any time until the lock.</p>
              <ul>
                <li>Each wallet has a cap, so nobody can take the round.</li>
                <li>In Verified rounds: one place per verified Hyperliquid account.</li>
              </ul>
            </div>
          </article>
          <article className="step">
            <div className="ill" aria-hidden="true">
              <FireArt />
              <span className="t0" />
              <span className="tick">T0</span>
            </div>
            <div className="step-body">
              <span className="step-no">2</span>
              <h3 className="h3">Fire</h3>
              <p>At T0, one transaction, which anyone can send, turns the whole pot into Ascend&apos;s fee-free launch buy.</p>
              <ul>
                <li>Everyone, the dev included, pays the same average price.</li>
                <li>A buyer right after pays Ascend&apos;s launch fee, 90% falling to 1% over five seconds, and a higher price.</li>
              </ul>
            </div>
          </article>
          <article className="step">
            <div className="ill" aria-hidden="true">
              <LandArt />
              <span className="tick r">Dev&apos;s vesting ends</span>
            </div>
            <div className="step-body">
              <span className="step-no">3</span>
              <h3 className="h3">Land</h3>
              <p>Tokens are pushed to every wallet in the round. Any oversubscription goes back pro-rata.</p>
              <ul>
                <li>The dev&apos;s own share vests in public: a cliff, then linear.</li>
                <li>Anyone can read how much has unlocked, and when.</li>
              </ul>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
