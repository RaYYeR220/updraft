import Link from "next/link";
import { Mark } from "./Mark";

/** The header over the landing and the analysis page. */
export function SiteHeader() {
  return (
    <header className="top">
      <div className="in">
        <Mark />
        <nav className="nav" aria-label="Main">
          <Link href="/#how">How it works</Link>
          <Link href="/#guarantees">Guarantees</Link>
          <Link href="/#creators">Creators</Link>
          <Link href="/#draft">$DRAFT</Link>
          <Link className="pill" href="/rounds">
            Open the app
          </Link>
        </nav>
      </div>
    </header>
  );
}
