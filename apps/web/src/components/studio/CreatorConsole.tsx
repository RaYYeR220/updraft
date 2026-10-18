"use client";

import { useQuery } from "@tanstack/react-query";
import { type Policy, type RoundState, creatorVaultAbi, explorerAddress, explorerTx, updraftFactoryAbi } from "@updraft/sdk";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import {
  type Address,
  BaseError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  type Hash,
  erc20Abi,
  getAddress,
  isAddress,
  maxUint256,
  zeroAddress,
} from "viem";
import { deployment } from "@/lib/config";
import { indexer } from "@/lib/data";
import { publicClient, useWallet } from "@/lib/wallet";
import { Field, Seg, TextInput, TxNote } from "./fields";
import { BoundsRail, SplitBar } from "./figures";
import { fmtAmount, fmtCountdown, fmtDuration, fmtTime, pct, short, toUnits } from "./format";
import { send, useNow, useTx } from "./tx";

/** Updraft's own deployer: every round it created is a rehearsal of the full path on testnet. */
const UPDRAFT_DEPLOYER = "0xc6d9588923181fbb84acf028a85c442421828f02";

const FACTORIES = [deployment.factory as Address];

async function factoryOf(round: Address): Promise<Address | null> {
  const res = await publicClient.multicall({
    allowFailure: false,
    contracts: FACTORIES.map((address) => ({ address, abi: updraftFactoryAbi, functionName: "isRound", args: [round] }) as const),
  });
  const i = res.findIndex(Boolean);
  return i === -1 ? null : FACTORIES[i];
}

interface VaultState {
  policy: Policy;
  bounds: { min: Policy; max: Policy; timelock: number };
  pending: { policy: Policy; eta: number };
  teamOwedQuote: bigint;
  teamOwedToken: bigint;
  totalStaked: bigint;
  stakerReservedQuote: bigint;
  stakerReservedToken: bigint;
  exitEnabled: boolean;
  listingCap: bigint;
  exitEta: number;
  listingEta: number;
  pendingExit: Address;
  pendingListingCap: bigint;
  creator: Address;
}

interface FlowRow {
  id: string;
  kind: string;
  quote: string | null;
  token: string | null;
  actor: Address | null;
  detail: { policy?: Record<string, string | number>; eta?: string | number } | null;
  timestamp: number;
  tx: Hash;
}

async function readVault(vault: Address): Promise<VaultState> {
  const c = { address: vault, abi: creatorVaultAbi } as const;
  const r = await publicClient.multicall({
    allowFailure: false,
    contracts: [
      { ...c, functionName: "policy" },
      { ...c, functionName: "bounds" },
      { ...c, functionName: "pendingPolicy" },
      { ...c, functionName: "teamOwedQuote" },
      { ...c, functionName: "teamOwedToken" },
      { ...c, functionName: "totalStaked" },
      { ...c, functionName: "stakerReservedQuote" },
      { ...c, functionName: "stakerReservedToken" },
      { ...c, functionName: "exitEnabled" },
      { ...c, functionName: "listingCap" },
      { ...c, functionName: "exitEta" },
      { ...c, functionName: "listingEta" },
      { ...c, functionName: "pendingExit" },
      { ...c, functionName: "pendingListingCap" },
      { ...c, functionName: "creator" },
    ],
  });
  const [platformBps, bidBps, stakersBps, teamBps] = r[0] as readonly [number, number, number, number];
  const [pPolicy, pEta] = r[2] as readonly [Policy, number];
  return {
    policy: { platformBps, bidBps, stakersBps, teamBps },
    bounds: r[1] as VaultState["bounds"],
    pending: { policy: pPolicy, eta: Number(pEta) },
    teamOwedQuote: r[3] as bigint,
    teamOwedToken: r[4] as bigint,
    totalStaked: r[5] as bigint,
    stakerReservedQuote: r[6] as bigint,
    stakerReservedToken: r[7] as bigint,
    exitEnabled: r[8] as boolean,
    listingCap: r[9] as bigint,
    exitEta: Number(r[10]),
    listingEta: Number(r[11]),
    pendingExit: r[12] as Address,
    pendingListingCap: r[13] as bigint,
    creator: r[14] as Address,
  };
}

async function tokenMeta(addrs: Address[]) {
  const res = await publicClient.multicall({
    allowFailure: true,
    contracts: addrs.flatMap((address) => [
      { address, abi: erc20Abi, functionName: "symbol" } as const,
      { address, abi: erc20Abi, functionName: "decimals" } as const,
    ]),
  });
  return addrs.map((_, i) => ({
    symbol: res[i * 2].status === "success" ? (res[i * 2].result as string) : "token",
    decimals: res[i * 2 + 1].status === "success" ? Number(res[i * 2 + 1].result) : 18,
  }));
}

const ago = (now: number, ts: number) => {
  const s = Math.max(0, now - ts);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};

const split = (p: Policy) => ({ bid: p.bidBps, stakers: p.stakersBps, team: p.teamBps, platform: p.platformBps });

function Rules({ s, q }: { s: RoundState; q: { symbol: string; decimals: number } }) {
  const c = s.config;
  const a = (x: bigint) => `${fmtAmount(x, q.decimals)} ${q.symbol}`;
  const rows: [string, string][] = [
    ["Mode", Number(c.mode) === 1 ? "Verified: one place per Hyperliquid account" : "Open: any wallet, capped"],
    ["Raise", `At least ${a(c.raise.minRaise)}, at most ${a(c.raise.maxRaise)}`],
    ["Caps", `${a(c.raise.walletCap)} a wallet; the creator ${a(c.raise.creatorCap)}`],
    ["Lock", fmtTime(Number(c.windows.lockAt))],
    ["T0", fmtTime(Number(c.windows.closeAt))],
    ["Fire by", `${fmtTime(Number(c.windows.fireBy))}, or everyone is refunded`],
    ["The creator", `Nothing at T0, a ${fmtDuration(c.creatorVesting.cliff)} cliff, then ${fmtDuration(c.creatorVesting.duration)} linear`],
    [
      "Fee policy",
      `Ascend’s bid ${pct(c.policy.bidBps)}, stakers ${pct(c.policy.stakersBps)}, team ${pct(c.policy.teamBps)}, platform ${pct(c.policy.platformBps)}. Changes wait ${fmtDuration(c.bounds.timelock)}`,
    ],
    ["Creator role", c.exitEnabled ? "May leave the vault after the timelock" : "Stays with the vault for good"],
  ];
  return (
    <dl className="sd-ruletable">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CreatorConsole({ id }: { id: string }) {
  const { address, walletClient, updraft } = useWallet();
  const now = useNow(1000);
  const tx = useTx();
  const clockTx = useTx();
  const busy = tx.busy || clockTx.busy;
  const valid = isAddress(id);

  const resolved = useQuery({
    queryKey: ["console", "resolve", id],
    enabled: valid,
    refetchInterval: false,
    queryFn: async (): Promise<{ round: Address; factory: Address } | null> => {
      const a = getAddress(id);
      const direct = await factoryOf(a);
      if (direct) return { round: a, factory: direct };
      try {
        const r = await publicClient.readContract({ address: a, abi: creatorVaultAbi, functionName: "round" });
        const via = await factoryOf(r);
        if (via) return { round: r, factory: via };
      } catch (e) {
        // Only "this contract has no round()" means no; a flaky RPC is retried instead.
        const no = e instanceof BaseError && e.walk((x) => x instanceof ContractFunctionRevertedError || x instanceof ContractFunctionZeroDataError);
        if (!no) throw e;
      }
      return null;
    },
  });
  const roundAddr = resolved.data?.round;
  const round = useQuery({ queryKey: ["console", "round", roundAddr], enabled: !!roundAddr, queryFn: () => updraft.getRound(roundAddr!) });
  const s = round.data;
  const vaultAddr = s?.fired?.vault;
  const tokenAddr = s?.fired?.token ?? s?.expectedToken;
  const meta = useQuery({
    queryKey: ["console", "meta", s?.config.quote, tokenAddr, !!s?.fired],
    enabled: !!s,
    refetchInterval: false,
    queryFn: async () => {
      const [q, t] = await tokenMeta([s!.config.quote, ...(s!.fired ? [s!.fired.token] : [])]);
      return { q, t: t ?? { symbol: s!.config.symbol, decimals: 18 } };
    },
  });
  const vault = useQuery({ queryKey: ["console", "vault", vaultAddr], enabled: !!vaultAddr, queryFn: () => readVault(vaultAddr!) });
  const me = useQuery({
    queryKey: ["console", "me", vaultAddr, address],
    enabled: !!vaultAddr && !!address && !!s?.fired,
    queryFn: async () => {
      const t = s!.fired!.token;
      const [balance, allowance, staked, earned] = await publicClient.multicall({
        allowFailure: false,
        contracts: [
          { address: t, abi: erc20Abi, functionName: "balanceOf", args: [address!] },
          { address: t, abi: erc20Abi, functionName: "allowance", args: [address!, vaultAddr!] },
          { address: vaultAddr!, abi: creatorVaultAbi, functionName: "stakeOf", args: [address!] },
          { address: vaultAddr!, abi: creatorVaultAbi, functionName: "earned", args: [address!] },
        ],
      });
      return { balance, allowance, staked, earned: { quote: earned[0], token: earned[1] } };
    },
  });
  const flows = useQuery({
    queryKey: ["console", "flows", vaultAddr],
    enabled: !!vaultAddr,
    refetchInterval: 15_000,
    queryFn: async () => ((await indexer.vaultFlows(vaultAddr!)) as FlowRow[] | null) ?? null,
  });

  const v = vault.data;
  const [draft, setDraft] = useState<{ bid: number; stakers: number; team: number } | null>(null);
  useEffect(() => {
    if (v && !draft) setDraft({ bid: v.policy.bidBps, stakers: v.policy.stakersBps, team: v.policy.teamBps });
  }, [v, draft]);
  const [exitTo, setExitTo] = useState("");
  const [listing, setListing] = useState("");
  const [holdMode, setHoldMode] = useState<"stake" | "unstake">("stake");
  const [holdAmt, setHoldAmt] = useState("");

  if (!valid || resolved.data === null) {
    return (
      <main className="sd">
        <div className="sd-wrap">
          <p className="sd-crumbs">
            <Link href="/studio">Creator Studio</Link> / Console
          </p>
          <section className="sd-plate sd-empty">
            <h1 className="sd-h2">That isn’t an Updraft round.</h1>
            <p>
              <span className="mono">{id}</span> wasn’t created by the Updraft factory, and it isn’t a vault one of its rounds installed. Check the address, or
              find the round in the list.
            </p>
            <Link className="btn" href="/rounds">
              See all rounds
            </Link>
          </section>
        </div>
      </main>
    );
  }

  if (!s || !meta.data || (s.fired && !v)) {
    return (
      <main className="sd">
        <div className="sd-wrap">
          <p className="sd-crumbs">
            <Link href="/studio">Creator Studio</Link> / Console
          </p>
          <p className="cap sd-loading" role="status">
            {round.isError || resolved.isError || vault.isError ? "Couldn’t reach Elysium’s RPC. Retrying…" : "Reading the round and its vault from Elysium…"}
          </p>
        </div>
      </main>
    );
  }

  const q = meta.data.q;
  const t = meta.data.t;
  const qa = (x: bigint) => `${fmtAmount(x, q.decimals)} ${q.symbol}`;
  const ta = (x: bigint) => `${fmtAmount(x, t.decimals)} ${t.symbol}`;
  const isCreator = !!address && address.toLowerCase() === s.config.creator.toLowerCase();
  const rehearsal = s.config.creator.toLowerCase() === UPDRAFT_DEPLOYER;
  const status = s.status === 1 ? "Fired" : s.status === 2 ? "Aborted" : "Live";
  const clock = now ?? 0;

  const header = (
    <section className="sd-head cs-head" aria-labelledby="cs-title">
      <div>
        <div className="cs-title">
          <h1 className="sd-title" id="cs-title">
            {s.config.name}
          </h1>
          <span className="cs-sym">${s.config.symbol}</span>
        </div>
        <p className="cap sd-bin">
          Creator console for round{" "}
          <a className="mono" href={explorerAddress(s.address)} target="_blank" rel="noreferrer">
            {short(s.address)}
          </a>
          {s.fired ? (
            <>
              , fired {fmtTime(s.fired.firedAt)}.
            </>
          ) : (
            "."
          )}
        </p>
        <div className="cs-chips">
          <span className={`chip${s.status === 1 ? " fired" : ""}`}>{status}</span>
          <span className="chip">{Number(s.config.mode) === 1 ? "Verified round" : "Open round"}</span>
          {address && <span className="chip">{isCreator ? "You’re the creator" : "Viewing as a holder"}</span>}
          {rehearsal && <span className="chip ex">Rehearsal round</span>}
        </div>
        <p className="cs-line">
          Created by{" "}
          <a className="mono" href={explorerAddress(s.config.creator)} target="_blank" rel="noreferrer">
            {short(s.config.creator)}
          </a>
          .{" "}
          {s.fired ? (
            <>
              At T0, {qa(s.fired.quoteUsed)} bought {ta(s.fired.tokensOut)} in one transaction, for {s.participantCount} wallets at one price. Ascend’s creator role now
              sits in vault{" "}
              <a className="mono" href={explorerAddress(s.fired.vault)} target="_blank" rel="noreferrer">
                {short(s.fired.vault)}
              </a>
              .
            </>
          ) : (
            <>The vault is installed when the round fires.</>
          )}{" "}
          <Link className="link" href={`/rounds/${s.address}`}>
            Round page
          </Link>
        </p>
      </div>
      {s.fired && v && (
        <PendingClock
          v={v}
          now={clock}
          isCreator={isCreator}
          busy={busy}
          q={q}
          note={<TxNote state={clockTx.state} />}
          onRun={(label, call) => clockTx.run(label, () => send(walletClient, { address: s.fired!.vault, abi: creatorVaultAbi, ...call }))}
        />
      )}
    </section>
  );

  if (!s.fired || !v || !vaultAddr) {
    return (
      <main className="sd">
        <div className="sd-wrap">
          <p className="sd-crumbs">
            <Link href="/studio">Creator Studio</Link> / {s.config.symbol}
          </p>
          {header}
          <div className="cs-pre">
            <section className="sd-plate">
              <h2 className="sd-h2">{s.status === 2 ? "This round was aborted." : "Not fired yet."}</h2>
              <p className="sd-sub">
                {s.status === 2
                  ? `It stopped with reason “${s.abortReason}”, so no token launched and there is no vault. Everyone can take their share of what the round holds back from the round page.`
                  : `The vault, its policy and its controls appear here once the round fires at T0 (${fmtTime(Number(s.config.windows.closeAt))}). Until then, these are the rules it was created with.`}
              </p>
              <Rules s={s} q={q} />
              <Link className="btn" href={`/rounds/${s.address}`}>
                Open the round page
              </Link>
            </section>
          </div>
        </div>
      </main>
    );
  }

  const P = v.policy.platformBps;
  const span = 10_000 - P;
  const dsum = draft ? draft.bid + draft.stakers + draft.team : 0;
  const draftOk = !!draft && dsum === span;
  const unchanged = !!draft && draft.bid === v.policy.bidBps && draft.stakers === v.policy.stakersBps && draft.team === v.policy.teamBps;
  const call = (label: string, functionName: string, args: readonly unknown[] = []) =>
    tx.run(label, () => send(walletClient, { address: vaultAddr, abi: creatorVaultAbi, functionName, args }));
  const listingRaw = toUnits(listing, q.decimals);
  const holdRaw = toUnits(holdAmt, t.decimals);
  const m = me.data;

  const doHold = async () => {
    if (!holdRaw || holdRaw === 0n) return;
    if (holdMode === "unstake") return call(`Unstake ${t.symbol}`, "unstake", [holdRaw]);
    if (m && m.allowance < holdRaw) {
      const ok = await tx.run(`Allow the vault to take ${t.symbol}`, () =>
        send(walletClient, { address: s.fired!.token, abi: erc20Abi, functionName: "approve", args: [vaultAddr, maxUint256] }),
      );
      if (!ok) return;
    }
    return call(`Stake ${t.symbol}`, "stake", [holdRaw]);
  };

  const legsEdit = [
    { key: "bid", label: "Ascend’s bid", min: v.bounds.min.bidBps, max: v.bounds.max.bidBps },
    { key: "stakers", label: "Stakers", min: v.bounds.min.stakersBps, max: v.bounds.max.stakersBps },
    { key: "team", label: "Team", min: v.bounds.min.teamBps, max: v.bounds.max.teamBps },
  ] as const;

  return (
    <main className="sd">
      <div className="sd-wrap">
        <p className="sd-crumbs">
          <Link href="/studio">Creator Studio</Link> / {s.config.symbol}
        </p>
        {header}

        <div className="cs-main">
          <div className="cs-left">
            <section className="sd-plate" aria-labelledby="cs-policy">
              <h2 className="sd-h2" id="cs-policy">
                Fee policy
              </h2>
              <p className="sd-sub">
                Every creator fee Ascend pays this vault is split this way. The bounds were fixed at launch; any move inside them waits{" "}
                {fmtDuration(v.bounds.timelock)}, in public.
              </p>
              <SplitBar n={1} split={split(v.policy)} caption="The split in force now: where every 100 of creator fees goes." />
              <div className="sd-legs">
                <BoundsRail label="Ascend’s bid" min={v.bounds.min.bidBps} max={v.bounds.max.bidBps} value={v.policy.bidBps} />
                <BoundsRail label="Stakers" min={v.bounds.min.stakersBps} max={v.bounds.max.stakersBps} value={v.policy.stakersBps} />
                <BoundsRail label="Team" min={v.bounds.min.teamBps} max={v.bounds.max.teamBps} value={v.policy.teamBps} />
                <BoundsRail label="Platform" min={P} max={P} value={P} fixed />
              </div>
              <p className="cap">
                <b>Fig. 2.</b> Bounds fixed at launch. The bracket is as far as each share can ever move; the knob is where it sits now. The bid only buys with{" "}
                {q.symbol}, so its share of {t.symbol} fees goes to stakers, and with nobody staked, stakers’ shares go to the bid ({q.symbol}) and the $DRAFT
                basket ({t.symbol}).
              </p>
            </section>

            <section className="sd-plate" aria-labelledby="cs-bal">
              <h2 className="sd-h2" id="cs-bal">
                What the vault holds for people
              </h2>
              <dl className="sd-facts cs-bal">
                <div>
                  <dt>Owed to the team</dt>
                  <dd>
                    {qa(v.teamOwedQuote)}, {ta(v.teamOwedToken)}
                  </dd>
                </div>
                <div>
                  <dt>Reserved for stakers</dt>
                  <dd>
                    {qa(v.stakerReservedQuote)}, {ta(v.stakerReservedToken)}
                  </dd>
                </div>
                <div>
                  <dt>Staked by holders</dt>
                  <dd>{ta(v.totalStaked)}</dd>
                </div>
                <div>
                  <dt>Creator role</dt>
                  <dd>{v.exitEnabled ? (v.exitEta ? `leaving for ${short(v.pendingExit)}` : "may leave after a timelock") : "stays here for good"}</dd>
                </div>
                <div>
                  <dt>HyperCore listing set-aside</dt>
                  <dd>{v.listingCap > 0n ? `up to ${qa(v.listingCap)}` : "none"}</dd>
                </div>
              </dl>
              <p className="cap">Read from the vault contract now. Staked principal is never part of what gets split.</p>
            </section>

            <section className="sd-plate" aria-labelledby="cs-flows">
              <div className="cs-panelhead">
                <h2 className="sd-h2" id="cs-flows">
                  Field log
                </h2>
                <a className="cap" href={explorerAddress(vaultAddr)} target="_blank" rel="noreferrer">
                  Vault on the explorer
                </a>
              </div>
              {flows.data === undefined ? (
                <p className="sd-hint">Reading the indexer…</p>
              ) : flows.data === null ? (
                <p className="sd-hint">The indexer didn’t answer. The vault’s events are on the explorer meanwhile.</p>
              ) : flows.data.length === 0 ? (
                <div className="cs-emptylog">
                  <p>
                    <b>No flows yet.</b> Fees build up as people trade {t.symbol} on Ascend. A harvest pulls them in and routes them by the policy; every routing,
                    stake, claim and policy change will be listed here.
                  </p>
                </div>
              ) : (
                <ol className="cs-log">
                  {flows.data.map((f) => (
                    <FlowItem key={f.id} f={f} now={clock} qa={qa} ta={ta} />
                  ))}
                </ol>
              )}
            </section>
          </div>

          <div className="cs-right">
            <section className="sd-plate cs-actions" aria-labelledby="cs-act">
              <h2 className="sd-h2" id="cs-act">
                {isCreator ? "Your controls" : "Creator controls"}
              </h2>
              {!isCreator && (
                <p className="sd-sub">
                  Only the creator, <span className="mono">{short(v.creator)}</span>, can queue changes or claim the team’s share. Anyone can harvest, and anyone can
                  execute a queued change once its timelock has passed.
                </p>
              )}

              {isCreator && draft && (
                <div className="cs-block">
                  <h3 className="sd-h4">Move the split</h3>
                  {v.pending.eta ? (
                    <p className="sd-hint">A change is already queued. Execute or cancel it above before queuing another.</p>
                  ) : (
                    <>
                      <div className="sd-legs">
                        {legsEdit.map((l) => {
                          const val = draft[l.key];
                          return (
                            <div className="sd-legrow edit within" key={l.key}>
                              <label htmlFor={`cs-${l.key}`}>{l.label}</label>
                              <div className="sd-range">
                                <span className="b" style={{ left: `${l.min / 100}%`, width: `${(l.max - l.min) / 100}%` }} aria-hidden="true" />
                                <input
                                  id={`cs-${l.key}`}
                                  type="range"
                                  min={l.min}
                                  max={l.max}
                                  step={50}
                                  value={val}
                                  style={{ left: `calc(${l.min / 100}% - 10px)`, width: `calc(${(l.max - l.min) / 100}% + 20px)` }}
                                  onChange={(e) => setDraft({ ...draft, [l.key]: Number(e.target.value) })}
                                  aria-valuetext={pct(val)}
                                />
                              </div>
                              <span className="v num">{pct(val)}</span>
                            </div>
                          );
                        })}
                      </div>
                      <p className={`sd-sum${draftOk ? " ok" : ""}`}>
                        <span>
                          Bid, stakers and team: <b className="num">{pct(dsum)}</b> of {pct(span)}
                          {!draftOk && <> ({dsum < span ? `${pct(span - dsum)} left to place` : `${pct(dsum - span)} too much`})</>}
                        </span>
                      </p>
                      <button
                        type="button"
                        className="sd-dark"
                        disabled={!draftOk || unchanged || busy}
                        onClick={() => call("Queue the new split", "queuePolicy", [{ platformBps: P, bidBps: draft.bid, stakersBps: draft.stakers, teamBps: draft.team }])}
                      >
                        Queue this split
                      </button>
                      <p className="sd-fine">It applies after {fmtDuration(v.bounds.timelock)}. Holders see it queued the moment you send it.</p>
                    </>
                  )}
                </div>
              )}

              <div className="cs-block">
                <h3 className="sd-h4">Team share</h3>
                <p className="sd-hint">
                  Owed now: {qa(v.teamOwedQuote)} and {ta(v.teamOwedToken)}. {isCreator ? "Claiming pays it to your address." : "Only the creator can claim it."}
                </p>
                {isCreator && (
                  <button type="button" className="sd-dark" disabled={busy || (v.teamOwedQuote === 0n && v.teamOwedToken === 0n)} onClick={() => call("Claim the team share", "claimTeam")}>
                    Claim the team share
                  </button>
                )}
              </div>

              {isCreator && (
                <div className="cs-block">
                  <h3 className="sd-h4">Creator role</h3>
                  {!v.exitEnabled ? (
                    <p className="sd-hint">This round was created without an exit, so the vault holds Ascend’s creator role for good.</p>
                  ) : v.exitEta ? (
                    <p className="sd-hint">An exit to {short(v.pendingExit)} is queued. Execute or cancel it above.</p>
                  ) : (
                    <>
                      <Field id="cs-exit" label="Move the role to" hint={`After ${fmtDuration(v.bounds.timelock)}, anyone can execute it. Fees earned until then still follow the policy.`}>
                        <TextInput id="cs-exit" value={exitTo} onChange={setExitTo} placeholder="0x…" hint />
                      </Field>
                      <button type="button" className="sd-dark" disabled={busy || !isAddress(exitTo) || getAddress(exitTo) === zeroAddress} onClick={() => call("Queue the exit", "queueExit", [getAddress(exitTo)])}>
                        Queue the exit
                      </button>
                    </>
                  )}
                </div>
              )}

              {isCreator && (
                <div className="cs-block">
                  <h3 className="sd-h4">HyperCore listing set-aside</h3>
                  {v.listingEta ? (
                    <p className="sd-hint">A cap of {qa(v.pendingListingCap)} is queued. Execute or cancel it above.</p>
                  ) : (
                    <>
                      <Field id="cs-listing" label="New cap" hint={`Ascend sets part of the ${q.symbol} fees aside toward a spot listing, up to this. Now: ${v.listingCap > 0n ? qa(v.listingCap) : "none"}.`}>
                        <TextInput id="cs-listing" inputMode="decimal" value={listing} onChange={setListing} suffix={q.symbol} hint />
                      </Field>
                      <button type="button" className="sd-dark" disabled={busy || !listingRaw} onClick={() => listingRaw && call("Queue the listing cap", "queueListing", [listingRaw])}>
                        Queue the listing cap
                      </button>
                    </>
                  )}
                </div>
              )}
              <TxNote state={tx.state} />
            </section>

            <section className="sd-plate cs-hold" aria-labelledby="cs-hold">
              <h2 className="sd-h2" id="cs-hold">
                Stake {t.symbol} here
              </h2>
              <p className="sd-sub">
                Holders who stake {t.symbol} in this vault share {pct(v.policy.stakersBps)} of its {q.symbol} fees and {pct(v.policy.stakersBps + v.policy.bidBps)} of its{" "}
                {t.symbol} fees, by stake. Unstake any time.
              </p>
              {!address ? (
                <p className="sd-hint">Connect a wallet to stake, unstake or claim.</p>
              ) : !m ? (
                <p className="sd-hint">Reading your balances…</p>
              ) : (
                <>
                  <dl className="sd-facts">
                    <div>
                      <dt>In your wallet</dt>
                      <dd>{ta(m.balance)}</dd>
                    </div>
                    <div>
                      <dt>Staked here</dt>
                      <dd>{ta(m.staked)}</dd>
                    </div>
                    <div>
                      <dt>Earned</dt>
                      <dd>
                        {qa(m.earned.quote)}, {ta(m.earned.token)}
                      </dd>
                    </div>
                  </dl>
                  <div className="cs-holdrow">
                    <Seg
                      label="Stake or unstake"
                      value={holdMode}
                      onChange={setHoldMode}
                      options={[
                        { value: "stake", label: "Stake" },
                        { value: "unstake", label: "Unstake" },
                      ]}
                    />
                    <button type="button" className="sd-inline" onClick={() => setHoldAmt(fmtPlain(holdMode === "stake" ? m.balance : m.staked, t.decimals))}>
                      Max
                    </button>
                  </div>
                  <TextInput id="cs-amt" inputMode="decimal" value={holdAmt} onChange={setHoldAmt} suffix={t.symbol} placeholder="0" />
                  <div className="cs-holdbtns">
                    <button
                      type="button"
                      className="sd-dark"
                      disabled={busy || !holdRaw || holdRaw === 0n || holdRaw > (holdMode === "stake" ? m.balance : m.staked)}
                      onClick={doHold}
                    >
                      {holdMode === "stake" ? `Stake ${t.symbol}` : `Unstake ${t.symbol}`}
                    </button>
                    <button type="button" className="sd-ghost" disabled={busy || (m.earned.quote === 0n && m.earned.token === 0n)} onClick={() => call("Claim rewards", "claimRewards")}>
                      Claim rewards
                    </button>
                  </div>
                  {!isCreator && <TxNote state={tx.state} />}
                </>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function fmtPlain(raw: bigint, decimals: number) {
  const s = raw.toString().padStart(decimals + 1, "0");
  const int = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

function PendingClock({
  v,
  now,
  isCreator,
  busy,
  q,
  note,
  onRun,
}: {
  v: VaultState;
  now: number;
  isCreator: boolean;
  busy: boolean;
  q: { symbol: string; decimals: number };
  note: ReactNode;
  onRun: (label: string, call: { functionName: string; args?: readonly unknown[] }) => void;
}) {
  const items: { key: string; noun: string; what: string; eta: number; exec: string; cancel: string }[] = [];
  if (v.pending.eta)
    items.push({
      key: "policy",
      noun: "new split",
      what: `New split: bid ${pct(v.pending.policy.bidBps)}, stakers ${pct(v.pending.policy.stakersBps)}, team ${pct(v.pending.policy.teamBps)}`,
      eta: v.pending.eta,
      exec: "executePolicy",
      cancel: "cancelPolicy",
    });
  if (v.exitEta) items.push({ key: "exit", noun: "exit", what: `Creator role to ${short(v.pendingExit)}`, eta: v.exitEta, exec: "executeExit", cancel: "cancelExit" });
  if (v.listingEta)
    items.push({
      key: "listing",
      noun: "listing cap",
      what: `Listing cap of ${fmtAmount(v.pendingListingCap, q.decimals)} ${q.symbol}`,
      eta: v.listingEta,
      exec: "executeListing",
      cancel: "cancelListing",
    });
  const first = items[0];
  return (
    <aside className="cs-clock" aria-label="Queued changes">
      {first ? (
        <>
          <div className="lbl">{items.length > 1 ? `${items.length} changes queued; the next applies in` : "A change is queued; it can apply in"}</div>
          <div className="big num">{now ? fmtCountdown(first.eta - now) : "…"}</div>
          <ul className="cs-queue">
            {items.map((i) => {
              const ready = now >= i.eta;
              return (
                <li key={i.key}>
                  <p>
                    {i.what}. <span className="sd-muted">{ready ? "Ready now." : `From ${fmtTime(i.eta)}.`}</span>
                  </p>
                  <div className="cs-qbtns">
                    <button type="button" className="sd-dark" disabled={!ready || busy} onClick={() => onRun(`Execute the ${i.noun}`, { functionName: i.exec })}>
                      Execute
                    </button>
                    {isCreator && (
                      <button type="button" className="sd-ghost" disabled={busy} onClick={() => onRun(`Cancel the ${i.noun}`, { functionName: i.cancel })}>
                        Cancel
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <>
          <div className="lbl">Queued changes</div>
          <div className="big">None</div>
          <p className="cs-clocknote">Any change to the split, the listing cap or the creator role waits {fmtDuration(v.bounds.timelock)} here first, where everyone can see it.</p>
        </>
      )}
      <div className="cs-harvest">
        <p>Harvest pulls the fees Ascend owes this vault and routes them by the policy. Anyone can send it.</p>
        <button type="button" className="sd-ghost" disabled={busy} onClick={() => onRun("Harvest", { functionName: "harvest" })}>
          Harvest
        </button>
      </div>
      {note}
    </aside>
  );
}

function FlowItem({ f, now, qa, ta }: { f: FlowRow; now: number; qa: (x: bigint) => string; ta: (x: bigint) => string }) {
  const qv = f.quote ? BigInt(f.quote) : 0n;
  const tv = f.token ? BigInt(f.token) : 0n;
  const both = [qv > 0n ? qa(qv) : null, tv > 0n ? ta(tv) : null].filter(Boolean).join(", ");
  const who = f.actor ? short(f.actor) : null;
  const pol = f.detail?.policy;
  const label: Record<string, string> = {
    routed: "Fees routed",
    staked: "Staked",
    unstaked: "Unstaked",
    rewards: "Rewards claimed",
    team: "Team share claimed",
    policy_queued: "Split change queued",
    policy_executed: "Split changed",
    policy_cancelled: "Split change cancelled",
    exit_queued: "Exit queued",
    exited: "Creator role moved",
    listing: "Listing set-aside enrolled",
  };
  const detail =
    f.kind === "listing"
      ? `cap ${both || "0"}`
      : pol
        ? `bid ${pct(Number(pol.bidBps))}, stakers ${pct(Number(pol.stakersBps))}, team ${pct(Number(pol.teamBps))}`
        : both || (who ? "" : "nothing new");
  return (
    <li>
      <span className={`cs-dot ${f.kind}`} aria-hidden="true" />
      <div>
        <b>{label[f.kind] ?? f.kind}</b>
        {detail && <span className="num"> {detail}</span>}
        {who && <span className="sd-muted"> by <span className="mono">{who}</span></span>}
        <small>
          {ago(now, f.timestamp)}, {fmtTime(f.timestamp)}
        </small>
      </div>
      <a className="mono" href={explorerTx(f.tx)} target="_blank" rel="noreferrer" aria-label={`Transaction ${f.tx}`}>
        {f.tx.slice(0, 8)}…
      </a>
    </li>
  );
}

