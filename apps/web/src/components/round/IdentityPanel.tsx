"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { type Hex, keccak256, toBytes } from "viem";
import { type Attestation, type RoundState, explorerTx } from "@updraft/sdk";
import { API_URL } from "@/lib/config";
import { api } from "@/lib/data";
import { useWallet } from "@/lib/wallet";
import { ZERO_HASH, short, usdc, when } from "./format";
import type { Position } from "./hooks";

type Voucher = Extract<Attestation, { ok: true }>;
interface Refusal {
  reason: string;
  evidence: Record<string, unknown> | null;
  hash: Hex | null;
}

/** The attestor stores evidence as JSON with sorted keys; hashing the same form finds it again. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}
const evidenceHashOf = (evidence: unknown) => keccak256(toBytes(JSON.stringify(sortKeys(evidence))));

interface RulesV1 {
  minAgeDays: number;
  minFills: number;
  minStakedHype: number;
  minVolumeUsd: number;
  description: string[];
}

function refusalWords(r: Refusal, rules: RulesV1 | undefined): React.ReactNode {
  const ev = r.evidence ?? {};
  switch (r.reason) {
    case "too_new":
      return `This Hyperliquid account's first activity is less than ${rules?.minAgeDays ?? 30} days old. Accounts become eligible once their history is at least that long.`;
    case "no_activity":
      return `The account shows too little real activity: it needs at least ${rules?.minFills ?? 5} fills, ${rules?.minStakedHype ?? 1} HYPE staked, or $${(rules?.minVolumeUsd ?? 1000).toLocaleString("en-US")} of lifetime volume.`;
    case "cluster": {
      const c = (ev.cluster ?? {}) as { funder?: string; fundingTx?: string; linkedWallet?: string };
      return (
        <>
          This wallet was first funded by <span className="mono">{c.funder ? short(c.funder) : "a private wallet"}</span>, which also
          funded a wallet that already holds a place in this round
          {c.linkedWallet ? (
            <>
              {" "}
              (<span className="mono">{short(c.linkedWallet)}</span>)
            </>
          ) : null}
          . One account, one place. If both wallets are yours, commit from the one that already has the place.
          {c.fundingTx ? (
            <>
              {" "}
              <a href={explorerTx(c.fundingTx)} target="_blank" rel="noreferrer">
                See the funding transaction
              </a>
              .
            </>
          ) : null}
        </>
      );
    }
    case "link_invalid":
      return "The signature linking a Hyperliquid account to this wallet didn't check out, so nothing was decided.";
    case "unavailable":
      return "Hyperliquid's API didn't answer, so nothing was decided. Try again in a minute.";
    case "round_not_verified":
      return "This round doesn't need a voucher: any wallet can commit.";
    case "wrong_attestor":
      return "This round names a different attestor than Updraft's, so Updraft can't vouch for it.";
    case "unknown_round":
      return "The attestor doesn't recognise this round.";
    default:
      return `The attestor refused (${r.reason}).`;
  }
}

export function IdentityPanel({
  state,
  position,
  voucher,
  setVoucher,
}: {
  state: RoundState;
  position: Position | undefined;
  voucher: Voucher | null;
  setVoucher: (v: Voucher | null) => void;
}) {
  const { address: wallet, updraft } = useWallet();
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const rules = useQuery({
    queryKey: ["rules-v1"],
    queryFn: async () => (await api.rules()) as unknown as RulesV1 | null,
    staleTime: Number.POSITIVE_INFINITY,
    refetchInterval: false,
  });
  const cfg = state.config;

  if (cfg.mode !== 1) {
    return (
      <section className="panel" id="p-id" aria-labelledby="h-id">
        <div className="id-head">
          <h2 id="h-id">Your place</h2>
          <span className="chip">Open round</span>
        </div>
        <p className="sub">
          Any wallet can commit, up to <b>{usdc(cfg.raise.walletCap)} USDC</b> each. The creator can commit up to{" "}
          {usdc(cfg.raise.creatorCap)} USDC and pays the same price as everyone else.
        </p>
      </section>
    );
  }

  const held = position && position.identity !== ZERO_HASH ? position.identity : null;
  const verify = async () => {
    if (!wallet) return;
    setBusy(true);
    setRefusal(null);
    setFailure(null);
    try {
      const res = await updraft.attest({ round: state.address, wallet });
      if (res.ok) setVoucher(res);
      else {
        const evidence = (res.evidence ?? null) as Record<string, unknown> | null;
        setRefusal({ reason: res.reason, evidence, hash: evidence ? evidenceHashOf(evidence) : null });
      }
    } catch {
      setFailure("The attestor didn't answer. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" id="p-id" aria-labelledby="h-id">
      <div className="id-head">
        <h2 id="h-id">Your place</h2>
        <span className="chip">Verified round</span>
      </div>
      <p className="sub">
        One place per Hyperliquid account, and every verified wallet gets the same cap: {usdc(cfg.raise.walletCap)} USDC.
      </p>
      <div className="id-body" aria-live="polite">
        {held ? (
          <>
            <Badge ok>Verified with Hyperliquid</Badge>
            <ul className="id-list">
              <li>
                <span>Wallet</span>
                <span className="mono">{wallet ? short(wallet) : ""}</span>
              </li>
              <li>
                <span>Identity in this round</span>
                <span className="mono">{short(held)}</span>
              </li>
            </ul>
            <p className="cap">Your place is held. Top-ups need no new voucher.</p>
          </>
        ) : voucher ? (
          <>
            <Badge ok>Verified with Hyperliquid</Badge>
            <ul className="id-list">
              <li>
                <span>Wallet</span>
                <span className="mono">{short(voucher.voucher.wallet)}</span>
              </li>
              <li>
                <span>Identity</span>
                <span className="mono">{short(voucher.voucher.identityId)}</span>
              </li>
              <li>
                <span>Voucher</span>
                <span>valid until {when(Number(voucher.voucher.expiry))}</span>
              </li>
            </ul>
            <p className="cap">
              Commit before it expires to take your place. The decision's inputs are hashed and published (
              <a className="mono" href={`${API_URL}/evidence/${voucher.evidenceHash}`} target="_blank" rel="noreferrer">
                {short(voucher.evidenceHash)}
              </a>
              ), so anyone can re-check it.
            </p>
          </>
        ) : refusal ? (
          <>
            <div className="refuse">
              <Badge>Refused for this round</Badge>
              <p>{refusalWords(refusal, rules.data ?? undefined)}</p>
            </div>
            <div className="evid">
              {refusal.hash && (
                <a href={`${API_URL}/evidence/${refusal.hash}`} target="_blank" rel="noreferrer">
                  The evidence behind this decision ({short(refusal.hash)})
                </a>
              )}
              <a href={`${API_URL}/rules/v1`} target="_blank" rel="noreferrer">
                The rules it was checked against (v1)
              </a>
            </div>
            <button type="button" className="hl-btn quiet" onClick={verify} disabled={busy}>
              {busy ? "Checking…" : "Check again"}
            </button>
          </>
        ) : (
          <>
            <p>
              Updraft reads the public history of the Hyperliquid account with this wallet's address and signs a voucher for this round.
              Nothing is moved and no key leaves your wallet.
            </p>
            {rules.data?.description && (
              <ul className="rule-list">
                {rules.data.description.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
            <button type="button" className="hl-btn" onClick={verify} disabled={!wallet || busy}>
              {!wallet ? "Connect a wallet to verify" : busy ? "Checking Hyperliquid…" : "Verify with Hyperliquid"}
            </button>
            {failure && <p className="err on">{failure}</p>}
            <p className="fine">
              <a href={`${API_URL}/rules/v1`} target="_blank" rel="noreferrer">
                Read the rules (v1)
              </a>
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function Badge({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  return (
    <span className="badge">
      {ok ? (
        <svg viewBox="0 0 22 22" aria-hidden="true">
          <circle cx="11" cy="11" r="10" fill="#c7d83b" stroke="#2e4527" strokeWidth="1.5" />
          <path d="M6.5 11.5 L9.6 14.4 L15.6 7.8" fill="none" stroke="#2e4527" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 22 22" aria-hidden="true">
          <circle cx="11" cy="11" r="10" fill="none" stroke="#9a3b1f" strokeWidth="1.5" />
          <path d="M7.5 7.5 L14.5 14.5 M14.5 7.5 L7.5 14.5" stroke="#9a3b1f" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
      {children}
    </span>
  );
}
