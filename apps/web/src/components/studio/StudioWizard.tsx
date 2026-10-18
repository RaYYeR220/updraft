"use client";

import { useQuery } from "@tanstack/react-query";
import { ascendLaunchpadAbi, ascendTestnet, predictToken, updraftFactoryAbi, updraftLensAbi } from "@updraft/sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Address, erc20Abi, parseEventLogs } from "viem";
import { API_URL, deployment } from "@/lib/config";
import { publicClient, useWallet } from "@/lib/wallet";
import { type Draft, type Env, type FactoryParams, PARAMS_FALLBACK, STEPS, check, defaultDraft, randomSalt } from "./draft";
import { fmtDuration, pct } from "./format";
import { SummaryPlate, rulesRows } from "./SummaryPlate";
import { FeesStep, ModeStep, RaiseStep, StepHead, type StepProps, TokenStep, VestingStep, WindowsStep } from "./steps";
import { useNow, useTx } from "./tx";

const QUOTES = {
  usdc: { address: ascendTestnet.usdc as Address, symbol: "USDC", decimals: 6 },
};

const factory = { address: deployment.factory, abi: updraftFactoryAbi } as const;

function ReviewStep(props: StepProps & { onSalts: () => void }) {
  const { d, env, chk, onSalts } = props;
  const json = chk.cfg ? JSON.stringify({ cfg: chk.cfg, roundSalt: d.roundSalt }, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2) : null;
  return (
    <>
      <StepHead n={7} title="Read it back" sub="This is the rules table participants will see on the round page. The factory checks every line again when you create the round." />
      <dl className="sd-ruletable">
        {rulesRows(d, env, chk).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        <div>
          <dt>Every batch</dt>
          <dd>
            {pct(env.params.parityBps)} funds Ascend’s own bid; {pct(env.params.platformTokenBps)} of the tokens go to $DRAFT stakers. Both are inside everyone’s
            price.
          </dd>
        </div>
      </dl>
      <details className="sd-details">
        <summary>The exact call: createRound(cfg, roundSalt)</summary>
        {json ? <pre className="mono">{json}</pre> : <p className="sd-hint">Complete the steps above and connect a wallet to see it.</p>}
        <div className="sd-salts">
          <p>
            Round salt <span className="mono">{d.roundSalt.slice(0, 18)}…</span>, token salt <span className="mono">{d.tokenSalt.slice(0, 18)}…</span>. Random, so
            the addresses are yours alone.
          </p>
          <button type="button" className="sd-ghost" onClick={onSalts}>
            New salts
          </button>
        </div>
      </details>
    </>
  );
}

export function StudioWizard() {
  const { address, walletClient, updraft, connectInjected, startDemo } = useWallet();
  const [d, setD] = useState<Draft>(defaultDraft);
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState<Set<number>>(() => new Set());
  const [created, setCreated] = useState<{ round: Address; token: Address; hash: string } | null>(null);
  const now = useNow(1000);
  const tx = useTx();
  const headRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setD((x) => ({ ...x, tokenSalt: randomSalt(), roundSalt: randomSalt() }));
  }, []);

  const set = useCallback((patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch })), []);
  const quote = QUOTES[d.quote];

  const params = useQuery({
    queryKey: ["studio", "params"],
    queryFn: async () => (await publicClient.readContract({ ...factory, functionName: "params" })) as FactoryParams,
    refetchInterval: false,
  });
  const quoteMeta = useQuery({
    queryKey: ["studio", "quote", quote.address],
    queryFn: async () => {
      const [symbol, decimals, name, cfg] = await publicClient.multicall({
        allowFailure: false,
        contracts: [
          { address: quote.address, abi: erc20Abi, functionName: "symbol" },
          { address: quote.address, abi: erc20Abi, functionName: "decimals" },
          { address: quote.address, abi: erc20Abi, functionName: "name" },
          { address: deployment.launchpad, abi: ascendLaunchpadAbi, functionName: "quoteConfig", args: [quote.address] },
        ],
      });
      return { symbol, decimals, name, allowed: (cfg as { allowed: boolean }).allowed };
    },
    refetchInterval: false,
  });
  const attestorOk = useQuery({
    queryKey: ["studio", "attestor"],
    queryFn: () => publicClient.readContract({ ...factory, functionName: "isAttestor", args: [deployment.attestor] }),
    refetchInterval: false,
  });
  const rules = useQuery({
    queryKey: ["studio", "rules"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/rules/v1`);
      return res.ok ? ((await res.json()) as { description?: string[] }) : null;
    },
    refetchInterval: false,
  });
  const predictedRound = useQuery({
    queryKey: ["studio", "predictRound", d.roundSalt, address],
    queryFn: () => updraft.predictRound(d.roundSalt, address!),
    enabled: !!address && /^0x[0-9a-f]{64}$/i.test(d.roundSalt) && BigInt(d.roundSalt) !== 0n,
    refetchInterval: false,
  });
  const predictedToken = useMemo(() => {
    if (!predictedRound.data || !d.name.trim() || !d.symbol.trim()) return null;
    return predictToken({ launchpad: deployment.launchpad, round: predictedRound.data, tokenSalt: d.tokenSalt, name: d.name.trim(), symbol: d.symbol.trim() });
  }, [predictedRound.data, d.tokenSalt, d.name, d.symbol]);
  const tokenIs0 = predictedToken ? predictedToken.toLowerCase() < quote.address.toLowerCase() : null;
  const capacity = useQuery({
    queryKey: ["studio", "capacity", quote.address, tokenIs0],
    queryFn: async () => {
      const read = (t: boolean) =>
        publicClient.readContract({ address: deployment.lens, abi: updraftLensAbi, functionName: "capacity", args: [deployment.launchpad, quote.address, t] });
      if (tokenIs0 !== null) return read(tokenIs0);
      const [a, b] = await Promise.all([read(true), read(false)]);
      return a < b ? a : b;
    },
    refetchInterval: 60_000,
  });

  const env: Env = {
    now: now ?? 0,
    wallet: address,
    launchpad: deployment.launchpad,
    attestor: deployment.attestor,
    quote: quoteMeta.data ? { address: quote.address, symbol: quoteMeta.data.symbol, decimals: quoteMeta.data.decimals } : quote,
    capacity: capacity.data ?? null,
    params: params.data ?? PARAMS_FALLBACK,
    attestorAllowed: attestorOk.data ?? null,
    quoteAllowed: quoteMeta.data?.allowed ?? null,
  };
  // Until the clock is read on the client, nothing time-based is shown, so the server markup matches.
  const checked = check(d, env);
  const chk = now === null ? { ...checked, times: null } : checked;
  const err = (field: string) => {
    const p = chk.problems.find((x) => x.field === field);
    return p && touched.has(p.step) ? p.msg : null;
  };

  const go = (i: number) => {
    setStep(i);
    requestAnimationFrame(() => {
      document.getElementById("sd-step-title")?.focus({ preventScroll: true });
      const top = headRef.current?.getBoundingClientRect().top ?? 0;
      if (top < 0) headRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  const next = () => {
    setTouched((t) => new Set(t).add(step));
    const first = chk.problems.find((p) => p.step === step && p.field !== "wallet");
    if (first) {
      requestAnimationFrame(() => document.getElementById(`sd-${first.field}`)?.focus());
      return;
    }
    go(Math.min(step + 1, STEPS.length - 1));
  };

  const create = async () => {
    setTouched(new Set(STEPS.map((_, i) => i)));
    const fresh = check(d, { ...env, now: Math.floor(Date.now() / 1000) });
    if (!fresh.cfg || fresh.problems.length) return;
    const cfg = fresh.cfg;
    const receipt = await tx.run("Create round", () => updraft.createRound(cfg, d.roundSalt));
    if (!receipt) return;
    const [ev] = parseEventLogs({ abi: updraftFactoryAbi, eventName: "RoundCreated", logs: receipt.logs });
    if (ev) setCreated({ round: ev.args.round, token: ev.args.token, hash: receipt.transactionHash });
  };

  const props: StepProps = { d, set, err, env, chk, quoteName: quoteMeta.data?.name ?? null, rules: rules.data ?? null, clockReady: now !== null };
  const stepBad = (i: number) => touched.has(i) && chk.problems.some((p) => p.step === i && p.field !== "wallet");
  const stepDone = (i: number) => touched.has(i) && !chk.problems.some((p) => p.step === i);
  const p = env.params;

  return (
    <main className="sd">
      <div className="sd-wrap">
        <p className="sd-crumbs">
          <span>Creator Studio</span> / New round
        </p>
        <section className="sd-head" aria-labelledby="sd-title">
          <div>
            <h1 className="sd-title" id="sd-title">
              Creator Studio
            </h1>
            <p className="cap sd-bin">A new entry for the field guide, filled in plate by plate.</p>
            <p className="sd-intro">
              Seven steps, then one transaction. You set the token, the windows, the raise, who can join, the unlocks and the fee policy. Once the round
              exists, nobody can change any of it, you included.
            </p>
          </div>
          <aside className="sd-terms" aria-labelledby="sd-terms-h">
            <p className="sd-label" id="sd-terms-h">
              Terms every round gets, read from the factory
            </p>
            <dl className="sd-facts">
              <div>
                <dt>Platform share of creator fees</dt>
                <dd>{pct(p.platformFeeBps)}, fixed</dd>
              </div>
              <div>
                <dt>Funds Ascend’s own bid</dt>
                <dd>{pct(p.parityBps)} of each batch</dd>
              </div>
              <div>
                <dt>To $DRAFT stakers</dt>
                <dd>{pct(p.platformTokenBps)} of the tokens</dd>
              </div>
              <div>
                <dt>Team share, at most</dt>
                <dd>{pct(p.maxTeamBps)}</dd>
              </div>
              <div>
                <dt>Shortest timelock</dt>
                <dd>{fmtDuration(p.minPolicyTimelock)}</dd>
              </div>
            </dl>
            <p className="cap">{params.isError ? "Couldn’t reach the factory; showing the values it was deployed with." : "Live from the Updraft factory on Elysium testnet."}</p>
          </aside>
        </section>

        <div ref={headRef} className="sd-railwrap">
          <ol className="sd-rail" aria-label="Steps">
            {STEPS.map((s, i) => (
              <li key={s}>
                <button
                  type="button"
                  aria-current={i === step ? "step" : undefined}
                  className={stepBad(i) ? "bad" : stepDone(i) ? "done" : undefined}
                  onClick={() => go(i)}
                >
                  <span className="n">{i + 1}</span>
                  <span className="l">{s}</span>
                  {stepBad(i) && <span className="sr"> (needs attention)</span>}
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div className="sd-main">
          <section className="sd-plate sd-step" aria-labelledby="sd-step-title">
            {step === 0 && <TokenStep {...props} />}
            {step === 1 && <WindowsStep {...props} />}
            {step === 2 && <RaiseStep {...props} />}
            {step === 3 && <ModeStep {...props} />}
            {step === 4 && <VestingStep {...props} />}
            {step === 5 && <FeesStep {...props} />}
            {step === 6 && <ReviewStep {...props} onSalts={() => set({ tokenSalt: randomSalt(), roundSalt: randomSalt() })} />}
            <nav className="sd-nav" aria-label="Step navigation">
              {step > 0 ? (
                <button type="button" className="sd-ghost" onClick={() => go(step - 1)}>
                  Back to {STEPS[step - 1].toLowerCase()}
                </button>
              ) : (
                <span />
              )}
              {step < STEPS.length - 1 && (
                <button type="button" className="btn" onClick={next}>
                  Next: {STEPS[step + 1].toLowerCase()}
                </button>
              )}
            </nav>
          </section>

          <SummaryPlate
            d={d}
            env={env}
            chk={chk}
            predictedRound={predictedRound.data ?? null}
            predictedToken={predictedToken}
            onStep={(i) => {
              setTouched((t) => new Set(t).add(i));
              go(i);
            }}
            onCreate={create}
            tx={tx}
            created={created}
            connect={
              address || walletClient
                ? null
                : {
                    injected: connectInjected,
                    demo: () => {
                      void startDemo();
                    },
                  }
            }
          />
        </div>
      </div>
    </main>
  );
}
