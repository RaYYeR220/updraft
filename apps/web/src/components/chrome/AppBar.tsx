"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mark } from "./Mark";
import { WalletButton } from "./WalletButton";

const LINKS = [
  { href: "/rounds", label: "Rounds" },
  { href: "/studio", label: "Creator Studio" },
  { href: "/stake", label: "Stake $DRAFT" },
  { href: "/bottom-of-curve", label: "Bottom of the curve" },
  { href: "/docs", label: "Docs" },
];

export function AppBar() {
  const path = usePathname();
  return (
    <header className="bar">
      <div className="wrap">
        <Mark />
        <nav className="nav" aria-label="App">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="acct">
          <span className="net">
            <i />
            Elysium testnet
          </span>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
