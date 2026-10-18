import { explorerTx } from "@updraft/sdk";
import type { TxState } from "./hooks";

/** One line under an action: what the wallet is doing, then the outcome with its explorer link. */
export function TxStatus({ tx }: { tx: TxState | null }) {
  if (!tx) return <p className="txs" role="status" aria-live="polite" />;
  const link = tx.hash ? (
    <a className="txs-link" href={explorerTx(tx.hash)} target="_blank" rel="noreferrer">
      View on the explorer
    </a>
  ) : null;
  return (
    <p className={`txs ${tx.phase}`} role="status" aria-live="polite">
      {tx.phase === "signing" && <>Confirm “{tx.label}” in your wallet…</>}
      {tx.phase === "pending" && <>Sent. Waiting for Elysium to include it… {link}</>}
      {tx.phase === "done" && (
        <>
          {tx.message} {link}
        </>
      )}
      {tx.phase === "failed" && (
        <>
          {tx.message} {link}
        </>
      )}
    </p>
  );
}
