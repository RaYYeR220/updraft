import Link from "next/link";
import { PerchDefs } from "./Bird";
import { PerchWire } from "./PerchWire";
import "@/styles/landing.css";

const GITHUB = "https://github.com/RaYYeR220/updraft";
const X = "https://x.com/";

/** The footer under the landing and the analysis page. It also carries the perched-bird symbol their figures use. */
export function SiteFooter() {
  return (
    <footer className="site-foot">
      <PerchDefs />
      <PerchWire />
      <div className="foot">
        <div className="fw">
          <p className="wordmark">Updraft</p>
          <p>Fair launches on Ascend. One round, one buy, one price for everyone in it.</p>
        </div>
        <nav aria-label="Product">
          <h2>Product</h2>
          <ul>
            <li>
              <Link href="/rounds">Rounds</Link>
            </li>
            <li>
              <Link href="/studio">Creator Studio</Link>
            </li>
            <li>
              <Link href="/stake">$DRAFT</Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Build">
          <h2>Build</h2>
          <ul>
            <li>
              <Link href="/docs">Docs</Link>
            </li>
            <li>
              <Link href="/bottom-of-curve">Bottom of the curve</Link>
            </li>
            <li>
              <a href={GITHUB} target="_blank" rel="noreferrer">
                GitHub
              </a>
            </li>
          </ul>
        </nav>
        <nav aria-label="Follow">
          <h2>Follow</h2>
          <ul>
            <li>
              <a href={X} target="_blank" rel="noreferrer">
                X
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <div className="foot-base">
        <span>
          <b>Built on Ascend · Elysium testnet</b>
        </span>
        <span>Updraft field guide, plates I to VII</span>
      </div>
    </footer>
  );
}
