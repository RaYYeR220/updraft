"use client";

import { useState } from "react";
import { useWallet } from "@/lib/wallet";
import { dripWords } from "@/lib/demo-wallet";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Connect a browser wallet, or try Updraft with a throwaway demo wallet funded with test USDC. */
export function WalletButton() {
  const { address, kind, connectInjected, startDemo, disconnect, wrongNetwork, switchNetwork } = useWallet();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // This browser holds the demo wallet's only key, so forgetting it takes a second click.
  const [confirming, setConfirming] = useState(false);

  if (address && wrongNetwork) {
    return (
      <button type="button" className="wallet connect" onClick={switchNetwork}>
        Switch to Elysium testnet
      </button>
    );
  }

  if (address) {
    return (
      <>
        <button
          type="button"
          className="wallet"
          onClick={() => {
            setOpen((o) => !o);
            setConfirming(false);
          }}
          aria-expanded={open}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="11" fill="#c7d83b" />
            <path d="M5 13 L10 9 L12 11.2 L14 9 L19 13 L14 11.2 L12 14.2 L10 11.2 Z" fill="#231e19" />
          </svg>
          {short(address)}
        </button>
        {open && (
          <div className="wallet-menu" role="menu">
            <p className="note">{kind === "demo" ? "Demo wallet: lives in this browser only, testnet funds." : "Browser wallet"}</p>
            <button type="button" onClick={() => navigator.clipboard?.writeText(address)}>
              Copy address
            </button>
            {confirming && (
              <p className="note">This browser holds the only copy of the key. Tokens from rounds it joined stay on an address no one can open.</p>
            )}
            <button
              type="button"
              onClick={() => {
                if (kind === "demo" && !confirming) return setConfirming(true);
                disconnect();
                setOpen(false);
                setConfirming(false);
              }}
            >
              {kind !== "demo" ? "Disconnect" : confirming ? "Forget it for good" : "Forget demo wallet"}
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <button type="button" className="wallet connect" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Connect
      </button>
      {open && (
        <div className="wallet-menu" role="menu">
          <button
            type="button"
            onClick={() => {
              connectInjected();
              setOpen(false);
            }}
          >
            Browser wallet<small>&nbsp;Rabby, MetaMask…</small>
          </button>
          <button
            type="button"
            onClick={async () => {
              setNote("Funding a demo wallet with test USDC…");
              const res = await startDemo();
              setNote(res.ok ? "Ready: 5,000 test USDC and gas." : dripWords(res.reason));
            }}
          >
            Try with a demo wallet<small>&nbsp;no install</small>
          </button>
          {note && <p className="note">{note}</p>}
        </div>
      )}
    </>
  );
}
