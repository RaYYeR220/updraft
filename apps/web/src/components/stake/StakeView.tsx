"use client";

import { useQuery } from "@tanstack/react-query";
import { isRehearsal } from "@/components/round/format";
import { creatorVaultAbi, explorerAddress, explorerTx, updraftFactoryAbi, updraftRoundAbi, updraftStakingAbi } from "@updraft/sdk";
import Link from "next/link";
import { useState } from "react";
import { type Address, type Hash, type Hex, erc20Abi, maxUint256, zeroAddress } from "viem";
import { Seg, TextInput, TxNote } from "@/components/studio/fields";
import { fmtAmount, fmtTime, pct, short, toUnits } from "@/components/studio/format";
import { send, useTx } from "@/components/studio/tx";
import { API_URL, deployment } from "@/lib/config";
import { publicClient, useWallet } from "@/lib/wallet";

const staking = { address: deployment.staking, abi: updraftStakingAbi } as const;
const factory = { address: deployment.factory, abi: updraftFactoryAbi } as const;

interface EpochRow {
  id: number;
  start: number;
  end: number;
  root: Hex;
  tx: Hash | null;
}
interface ClaimRow {
  epoch: number;
  account: Address;
  asset: Address;
  amount: string;
  proof: Hex[];
}

const plain = (raw: bigint, decimals: number) => {
  const s = raw.toString().padStart(decimals + 1, "0");
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return frac ? `${s.slice(0, s.length - decimals)}.${frac}` : s.slice(0, s.length - decimals);
};

async function metaOf(assets: Address[]) {
  if (!assets.length) return new Map<string, { symbol: string; decimals: number; name: string }>();
  const r = await publicClient.multicall({
    allowFailure: true,
    contracts: assets.flatMap((address) => [
      { address, abi: erc20Abi, functionName: "symbol" } as const,
      { address, abi: erc20Abi, functionName: "decimals" } as const,
      { address, abi: erc20Abi, functionName: "name" } as const,
    ]),
  });
  return new Map(
    assets.map((a, i) => [
      a.toLowerCase(),
      {
        symbol: r[i * 3].status === "success" ? String(r[i * 3].result) : short(a),
        decimals: r[i * 3 + 1].status === "success" ? Number(r[i * 3 + 1].result) : 18,
        name: r[i * 3 + 2].status === "success" ? String(r[i * 3 + 2].result) : "",
      },
    ]),
  );
}

/** Deposited events since the deployment, in windows small enough for a public RPC. */
async function depositLogs() {
  const event = updraftStakingAbi.find((e) => e.type === "event" && e.name === "Deposited")!;
  type Log = Awaited<ReturnType<typeof publicClient.getLogs>>[number];
  const latest = await publicClient.getBlockNumber();
  const from = BigInt(deployment.deployBlock);
  try {
    return await publicClient.getLogs({ address: deployment.staking, event: event as never, fromBlock: from, toBlock: latest });
  } catch {
    const out: Log[] = [];
    for (let b = from; b <= latest; b += 50_000n) {
      const to = b + 49_999n > latest ? latest : b + 49_999n;
      out.push(...(await publicClient.getLogs({ address: deployment.staking, event: event as never, fromBlock: b, toBlock: to })));
    }
    return out;
  }
}

/**
 * Which depositors count: rounds the factory created, and vaults those rounds installed. Checked
 * on-chain, so the basket never depends on the indexer.
 */
async function sourcesOf(froms: Address[]) {
  const out = new Map<string, { label: string; kind: "round" | "vault"; rehearsal: boolean }>();
  if (!froms.length) return out;
  const [direct, viaVault] = await Promise.all([
    publicClient.multicall({ allowFailure: true, contracts: froms.map((f) => ({ ...factory, functionName: "isRound", args: [f] }) as const) }),
    publicClient.multicall({ allowFailure: true, contracts: froms.map((f) => ({ address: f, abi: creatorVaultAbi, functionName: "round" }) as const) }),
  ]);
  const vaultRounds = froms.map((_, i) => (viaVault[i].status === "success" ? (viaVault[i].result as Address) : null));
  const vaultOk = await publicClient.multicall({
    allowFailure: true,
    contracts: vaultRounds.map((r) => ({ ...factory, functionName: "isRound", args: [r ?? zeroAddress] }) as const),
  });
  const rounds = froms.map((f, i) =>
    direct[i].status === "success" && direct[i].result ? { round: f, kind: "round" as const } : vaultRounds[i] && vaultOk[i].status === "success" && vaultOk[i].result ? { round: vaultRounds[i]!, kind: "vault" as const } : null,
  );
  const cfgs = await publicClient.multicall({
    allowFailure: true,
    contracts: rounds.map((r) => ({ address: r?.round ?? zeroAddress, abi: updraftRoundAbi, functionName: "config" }) as const),
  });
  froms.forEach((f, i) => {
    const r = rounds[i];
    const c = cfgs[i];
    if (!r || c.status !== "success") return;
    const cfg = c.result as unknown as { symbol: string; creator: Address };
    out.set(f.toLowerCase(), { label: cfg.symbol, kind: r.kind, rehearsal: isRehearsal(cfg.creator) });
  });
  return out;
}

export function StakeView() {
  const { address, walletClient } = useWallet();
  const tx = useTx();
  const claimTx = useTx();
  const [mode, setMode] = useState<"stake" | "unstake">("stake");
  const [amt, setAmt] = useState("");

  const chain = useQuery({
    queryKey: ["stake", "chain"],
    queryFn: async () => {
      const [stakeToken, totalStaked, epochCount, params] = await publicClient.multicall({
        allowFailure: false,
        contracts: [
          { ...staking, functionName: "stakeToken" },
          { ...staking, functionName: "totalStaked" },
          { ...staking, functionName: "epochCount" },
          { address: deployment.factory, abi: updraftFactoryAbi, functionName: "params" },
        ],
      });
      return { stakeToken, totalStaked, epochCount: Number(epochCount), params };
    },
    refetchInterval: 15_000,
  });

  const basket = useQuery({
    queryKey: ["stake", "basket"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const logs = (await depositLogs()) as unknown as { args: { asset: Address; from: Address; amount: bigint }; transactionHash: Hash }[];
      const sources = await sourcesOf([...new Set(logs.map((l) => l.args.from))]);
      const by = new Map<string, { asset: Address; total: bigint; count: number; from: Set<string>; lastTx: Hash; rehearsal: boolean }>();
      for (const l of logs) {
        const src = sources.get(l.args.from.toLowerCase());
        if (!src) continue;
        const k = l.args.asset.toLowerCase();
        const row = by.get(k) ?? { asset: l.args.asset, total: 0n, count: 0, from: new Set<string>(), lastTx: l.transactionHash, rehearsal: true };
        row.total += l.args.amount;
        row.count += 1;
        row.from.add(`${src.label} ${src.kind === "round" ? "launch" : "vault"}`);
        row.lastTx = l.transactionHash;
        row.rehearsal &&= src.rehearsal;
        by.set(k, row);
      }
      const rows = [...by.values()];
      const [meta, avail] = await Promise.all([
        metaOf(rows.map((r) => r.asset)),
        rows.length
          ? publicClient.multicall({ allowFailure: false, contracts: rows.map((r) => ({ ...staking, functionName: "available", args: [r.asset] }) as const) })
          : Promise.resolve([] as bigint[]),
      ]);
      return rows.map((r, i) => ({ ...r, meta: meta.get(r.asset.toLowerCase())!, available: avail[i] as bigint }));
    },
  });

  const epochs = useQuery({
    queryKey: ["stake", "epochs"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/epochs`);
      return res.ok ? ((await res.json()) as EpochRow[]) : null;
    },
  });

  const claims = useQuery({
    queryKey: ["stake", "claims", address],
    enabled: !!address,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/epochs/claims/${address}`);
      if (!res.ok) return null;
      const list = (await res.json()) as ClaimRow[];
      if (!list.length) return { open: [], done: [], meta: new Map() };
      const [flags, meta] = await Promise.all([
        publicClient.multicall({
          allowFailure: false,
          contracts: list.map((c) => ({ ...staking, functionName: "claimed", args: [BigInt(c.epoch), address!, c.asset] }) as const),
        }),
        metaOf([...new Set(list.map((c) => c.asset))]),
      ]);
      return { open: list.filter((_, i) => !flags[i]), done: list.filter((_, i) => flags[i]), meta };
    },
  });

  const stakeToken = chain.data?.stakeToken;
  const open = !!stakeToken && stakeToken !== zeroAddress;
  const mine = useQuery({
    queryKey: ["stake", "mine", stakeToken, address],
    enabled: open && !!address,
    queryFn: async () => {
      const [balance, allowance, staked, symbol, decimals] = await publicClient.multicall({
        allowFailure: false,
        contracts: [
          { address: stakeToken!, abi: erc20Abi, functionName: "balanceOf", args: [address!] },
          { address: stakeToken!, abi: erc20Abi, functionName: "allowance", args: [address!, deployment.staking] },
          { ...staking, functionName: "stakeOf", args: [address!] },
          { address: stakeToken!, abi: erc20Abi, functionName: "symbol" },
          { address: stakeToken!, abi: erc20Abi, functionName: "decimals" },
        ],
      });
      return { balance, allowance, staked, symbol, decimals };
    },
  });

  const p = chain.data?.params;
  const m = mine.data;
  const raw = m ? toUnits(amt, m.decimals) : null;
  const doStake = async () => {
    if (!m || !raw) return;
    if (mode === "unstake") return tx.run("Unstake $DRAFT", () => send(walletClient, { ...staking, functionName: "unstake", args: [raw] }));
    if (m.allowance < raw) {
      const ok = await tx.run("Allow staking to take $DRAFT", () =>
        send(walletClient, { address: stakeToken!, abi: erc20Abi, functionName: "approve", args: [deployment.staking, maxUint256] }),
      );
      if (!ok) return;
    }
    return tx.run("Stake $DRAFT", () => send(walletClient, { ...staking, functionName: "stake", args: [raw] }));
  };
  const claimAll = () => {
    const list = claims.data?.open ?? [];
    if (!list.length) return;
    return claimTx.run("Claim all", () =>
      send(walletClient, {
        ...staking,
        functionName: "claimMany",
        args: [list.map((c) => ({ epoch: BigInt(c.epoch), asset: c.asset, amount: BigInt(c.amount), proof: c.proof }))],
      }),
    );
  };

  return (
    <main className="sk">
      <section className="sk-roost" aria-labelledby="sk-title">
        <div className="sk-wrap sk-roostgrid">
          <div>
            <p className="sk-plateno">
              <b>VI</b>The roost
            </p>
            <h1 className="sk-h1" id="sk-title">
              Stake $DRAFT
            </h1>
            <p className="sk-lede">
              $DRAFT stakers earn the platform basket: the platform’s cut of every launch’s tokens and of every vault’s creator fees, paid out by epoch.
            </p>
            <div className="sk-earn">
              <div>
                <b>{p ? pct(p.platformFeeBps) : "10%"}</b>
                <span>of every Updraft vault’s creator fees</span>
              </div>
              <div>
                <b>{p ? pct(p.platformTokenBps) : "0.5%"}</b>
                <span>of the tokens every batch buys at T0</span>
              </div>
            </div>
          </div>

          <aside className="sk-card" aria-labelledby="sk-card-h">
            {!chain.data ? (
              <p className="sk-muted" role="status">
                {chain.isError ? "Couldn’t reach Elysium’s RPC. Retrying…" : "Reading the staking contract…"}
              </p>
            ) : !open ? (
              <>
                <p className="sk-cap">Staking status</p>
                <h2 id="sk-card-h">Staking opens when $DRAFT launches through Updraft.</h2>
                <p>
                  $DRAFT will launch in an Updraft round like any other token. The staking contract binds to it once, for good, and staking opens then. Until
                  then the basket below keeps filling from every round that fires.
                </p>
                <dl className="sk-facts">
                  <div>
                    <dt>Staked</dt>
                    <dd>nothing yet</dd>
                  </div>
                  <div>
                    <dt>Epochs posted</dt>
                    <dd>{chain.data.epochCount}</dd>
                  </div>
                  <div>
                    <dt>Contract</dt>
                    <dd>
                      <a className="mono" href={explorerAddress(deployment.staking)} target="_blank" rel="noreferrer">
                        {short(deployment.staking)}
                      </a>
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <>
                <p className="sk-cap">Your stake</p>
                <h2 id="sk-card-h">{m ? `${fmtAmount(m.staked, m.decimals)} ${m.symbol}` : address ? "Reading…" : "Connect a wallet"}</h2>
                <dl className="sk-facts">
                  <div>
                    <dt>In your wallet</dt>
                    <dd>{m ? `${fmtAmount(m.balance, m.decimals)} ${m.symbol}` : "–"}</dd>
                  </div>
                  <div>
                    <dt>Staked by everyone</dt>
                    <dd>{m ? `${fmtAmount(chain.data.totalStaked, m.decimals)} ${m.symbol}` : "–"}</dd>
                  </div>
                </dl>
                {m && (
                  <>
                    <div className="sk-row">
                      <Seg
                        label="Stake or unstake"
                        value={mode}
                        onChange={setMode}
                        options={[
                          { value: "stake", label: "Stake" },
                          { value: "unstake", label: "Unstake" },
                        ]}
                      />
                      <button type="button" className="sd-inline" onClick={() => setAmt(plain(mode === "stake" ? m.balance : m.staked, m.decimals))}>
                        Max
                      </button>
                    </div>
                    <TextInput id="sk-amt" inputMode="decimal" value={amt} onChange={setAmt} suffix={m.symbol} placeholder="0" />
                    <button
                      type="button"
                      className="btn on-forest sk-go"
                      disabled={tx.busy || !raw || raw > (mode === "stake" ? m.balance : m.staked)}
                      onClick={doStake}
                    >
                      {mode === "stake" ? "Stake $DRAFT" : "Unstake $DRAFT"}
                    </button>
                    <p className="sk-fine">Unstaking is never blocked: the staking contract keeps no reward accounting that could freeze principal.</p>
                  </>
                )}
              </>
            )}
            <TxNote state={tx.state} />
          </aside>
        </div>
      </section>

      <div className="sk-wrap sk-body">
        <section className="sk-plate" aria-labelledby="sk-basket">
          <div className="sk-head">
            <p className="sk-plateno">
              The basket
            </p>
            <div>
              <h2 className="sk-h2" id="sk-basket">
                What the basket already holds
              </h2>
              <p className="sk-sub">Every round that fires and every vault that routes fees deposits its platform cut here. The next epoch allocates what’s available.</p>
            </div>
          </div>
          {basket.data === undefined ? (
            <p className="sk-muted">{basket.isError ? "Couldn’t read the deposits. Retrying…" : "Reading deposits from the staking contract…"}</p>
          ) : basket.data.length === 0 ? (
            <p className="sk-empty">Nothing has been deposited yet. The first round to fire puts its token cut here.</p>
          ) : (
            <div className="sk-tablewrap">
              <table className="sk-table">
                <thead>
                  <tr>
                    <th scope="col">Asset</th>
                    <th scope="col">Deposited</th>
                    <th scope="col">For the next epoch</th>
                    <th scope="col">From</th>
                  </tr>
                </thead>
                <tbody>
                  {basket.data.map((r) => (
                    <tr key={r.asset}>
                      <th scope="row">
                        <a href={explorerAddress(r.asset)} target="_blank" rel="noreferrer">
                          {r.meta.symbol}
                        </a>
                        <small>{r.meta.name}</small>
                      </th>
                      <td className="num">{fmtAmount(r.total, r.meta.decimals)}</td>
                      <td className="num">{fmtAmount(r.available, r.meta.decimals)}</td>
                      <td>
                        {[...r.from].join(", ")}
                        {r.rehearsal && <span className="chip ex">rehearsal</span>}
                        <small>
                          {r.count} deposit{r.count === 1 ? "" : "s"}, last{" "}
                          <a className="mono" href={explorerTx(r.lastTx)} target="_blank" rel="noreferrer">
                            {r.lastTx.slice(0, 10)}…
                          </a>
                        </small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="cap sk-figcap">
            <b>Fig. 1.</b> Read live from the staking contract’s Deposited events since block {deployment.deployBlock.toLocaleString("en-US")}. Deposits from
            anything other than an Updraft round or its vault don’t count and aren’t listed.
          </p>
        </section>

        <section className="sk-plate" aria-labelledby="sk-epochs">
          <div className="sk-head">
            <p className="sk-plateno">
              Epochs
            </p>
            <div>
              <h2 className="sk-h2" id="sk-epochs">
                How the basket is paid out
              </h2>
              <p className="sk-sub">
                At the end of each epoch, the basket is split by time-weighted stake: what you had staked, multiplied by how long you held it during the epoch.
                The split is published as a Merkle root that anyone can recompute from the staking contract’s public events, and you claim your share with a
                proof.
              </p>
            </div>
          </div>
          {epochs.data === undefined ? (
            <p className="sk-muted">Reading epochs…</p>
          ) : epochs.data === null ? (
            <p className="sk-muted">The epochs service didn’t answer. Posted roots are on the staking contract meanwhile.</p>
          ) : epochs.data.length === 0 ? (
            <p className="sk-empty">
              No epoch has been posted yet. With nothing staked there’s nobody to allocate the basket to, so it keeps filling until staking opens.
            </p>
          ) : (
            <div className="sk-tablewrap">
              <table className="sk-table">
                <thead>
                  <tr>
                    <th scope="col">Epoch</th>
                    <th scope="col">Window</th>
                    <th scope="col">Root</th>
                    <th scope="col">Tree</th>
                  </tr>
                </thead>
                <tbody>
                  {epochs.data.map((e) => (
                    <tr key={e.id}>
                      <th scope="row">No. {e.id}</th>
                      <td>
                        {fmtTime(e.start)} to {fmtTime(e.end)}
                      </td>
                      <td>
                        {e.tx ? (
                          <a className="mono" href={explorerTx(e.tx)} target="_blank" rel="noreferrer">
                            {e.root.slice(0, 10)}…
                          </a>
                        ) : (
                          <span className="mono">{e.root.slice(0, 10)}…</span>
                        )}
                      </td>
                      <td>
                        <a className="link" href={`${API_URL}/epochs/${e.id}`} target="_blank" rel="noreferrer">
                          Tree JSON
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="cap sk-figcap">
            <b>Fig. 2.</b> Each epoch’s full tree, with every leaf and proof, is public at <span className="mono">{API_URL.replace(/^https?:\/\//, "")}/epochs/&lt;id&gt;</span>.
          </p>
        </section>

        <section className="sk-plate" aria-labelledby="sk-claims">
          <div className="sk-head">
            <p className="sk-plateno">
              Claims
            </p>
            <div>
              <h2 className="sk-h2" id="sk-claims">
                Your claims
              </h2>
              <p className="sk-sub">Every allocation to your address across all posted epochs. Claiming checks each proof against its epoch’s root on-chain.</p>
            </div>
          </div>
          {!address ? (
            <p className="sk-empty">Connect a wallet to see what it can claim.</p>
          ) : claims.data === undefined ? (
            <p className="sk-muted">Reading your allocations…</p>
          ) : claims.data === null ? (
            <p className="sk-muted">The epochs service didn’t answer. Try again in a moment.</p>
          ) : claims.data.open.length + claims.data.done.length === 0 ? (
            <p className="sk-empty">Nothing allocated to {short(address)} yet. Allocations appear here after the first epoch in which this address had $DRAFT staked.</p>
          ) : (
            <>
              <ul className="sk-claims">
                {[...claims.data.open.map((c) => ({ c, done: false })), ...claims.data.done.map((c) => ({ c, done: true }))].map(({ c, done }) => {
                  const mt = claims.data!.meta.get(c.asset.toLowerCase());
                  return (
                    <li key={`${c.epoch}-${c.asset}`} className={done ? "done" : undefined}>
                      <span>Epoch {c.epoch}</span>
                      <b className="num">
                        {fmtAmount(BigInt(c.amount), mt?.decimals ?? 18)} {mt?.symbol ?? short(c.asset)}
                      </b>
                      <span className="sk-muted">{done ? "claimed" : "ready"}</span>
                    </li>
                  );
                })}
              </ul>
              <button type="button" className="btn sk-claimall" disabled={tx.busy || claimTx.busy || claims.data.open.length === 0} onClick={claimAll}>
                {claims.data.open.length ? `Claim all (${claims.data.open.length})` : "Everything is claimed"}
              </button>
              <TxNote state={claimTx.state} />
            </>
          )}
        </section>

        <p className="sk-foot">
          Holders of a launched token can also stake it in that round’s own fee vault, from the round’s creator console (find the round in{" "}
          <Link className="link" href="/rounds">
            Rounds
          </Link>
          ). How epochs are built, and what they rely on, is in the{" "}
          <Link className="link" href="/docs#limits">
            docs
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
