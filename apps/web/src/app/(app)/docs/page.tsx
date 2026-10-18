import { ascendTestnet, elysiumTestnetDeployment, explorerAddress } from "@updraft/sdk";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { API_URL, INDEXER_URL } from "@/lib/config";
import { api } from "@/lib/data";
import "@/styles/docs.css";

export const metadata: Metadata = {
  title: "Docs",
  description: "Updraft on Elysium testnet: contracts, the SDK, the MCP server, the embed widget, the public API, Verified-round rules, fail-safes and honest limits.",
};

export const revalidate = 3600;

const d = elysiumTestnetDeployment;
const host = (u: string) => u.replace(/^https?:\/\//, "");

const SECTIONS = [
  ["what", "I", "What Updraft is"],
  ["contracts", "II", "Contracts"],
  ["sdk", "III", "SDK quickstart"],
  ["mcp", "IV", "MCP server"],
  ["widget", "V", "Embed widget"],
  ["api", "VI", "Public API"],
  ["verified", "VII", "Verified rounds"],
  ["failsafes", "VIII", "Fail-safes"],
  ["limits", "IX", "Honest limits"],
] as const;

const TOKEN = /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\/\/.*$|#.*$)/gm;

/** A code block with strings and comments set apart; nothing else is coloured. */
function Code({ lang, fig, children }: { lang: "ts" | "sh" | "json" | "html"; fig: string; children: string }) {
  const src = children.replace(/^\n/, "").replace(/\s+$/, "");
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of src.matchAll(TOKEN)) {
    const isComment = !!m[2] && (lang === "sh" ? m[2].startsWith("#") : m[2].startsWith("//"));
    if (!m[1] && !isComment) continue;
    parts.push(src.slice(last, m.index));
    parts.push(
      <span key={m.index} className={m[1] ? "s" : "c"}>
        {m[0]}
      </span>,
    );
    last = m.index! + m[0].length;
  }
  parts.push(src.slice(last));
  return (
    <figure className="dc-code">
      <pre tabIndex={0} aria-label={fig}>
        <code>{parts}</code>
      </pre>
      <figcaption className="cap">{fig}</figcaption>
    </figure>
  );
}

function Sec({ id, title, children }: { id: (typeof SECTIONS)[number][0]; title: string; children: ReactNode }) {
  const [, num, label] = SECTIONS.find((s) => s[0] === id)!;
  return (
    <section className="dc-sec" id={id} aria-labelledby={`h-${id}`}>
      <p className="dc-no" aria-hidden="true">
        <b>{num}</b>
        {label}
      </p>
      <h2 className="dc-h2" id={`h-${id}`}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Addr({ a }: { a: string }) {
  return (
    <a className="mono" href={explorerAddress(a)} target="_blank" rel="noreferrer">
      {a}
    </a>
  );
}

const TOOLS: [string, string, string][] = [
  ["updraft_list_rounds", "read", "Every round the factory has created."],
  ["updraft_get_round", "read", "One round’s full state: config, status, totals, the fire preview and, once fired, its token, pool and vault."],
  ["updraft_preview_price", "read", "What everyone would pay if a given amount were committed now."],
  ["updraft_get_certificate", "read", "The on-chain launch certificate for a token."],
  ["updraft_bottom_of_curve", "read", "The analysis of every launch on Ascend’s testnet launchpads."],
  ["updraft_build_commit_tx", "builds", "Unsigned approve and commit transactions for an Open round."],
  ["updraft_build_create_round_tx", "builds", "An unsigned createRound transaction from a JSON round config."],
];

const INDEXER: [string, string, string][] = [
  ["GET", "/rounds?status=live|fired|aborted", "Every round, newest first."],
  ["GET", "/rounds/:address", "One round with its participants."],
  ["GET", "/rounds/:address/commits", "Commits, withdrawals, refunds and claims."],
  ["GET", "/rounds/:address/swaps", "Trades on the launched token’s pool."],
  ["GET", "/certificates/:token", "The launch certificate, decoded."],
  ["GET", "/vaults/:address/flows", "Fee routing, stakes, claims and policy changes."],
  ["GET", "/wallets/:address", "A wallet’s places across rounds."],
  ["GET", "/stats", "Rounds, fired rounds, quote launched, participants."],
  ["POST", "/graphql", "GraphQL over the same tables."],
];

const API: [string, string, string][] = [
  ["GET", "/analysis", "Who bought the bottom of the curve in every Ascend testnet launch."],
  ["GET", "/rules/v1", "The rules Verified rounds apply, as JSON."],
  ["POST", "/attest", "{ round, wallet, hlAccount?, linkSignature? } → a signed voucher, or a refusal with its evidence."],
  ["GET", "/evidence/:hash", "The inputs behind one attest decision."],
  ["POST", "/drip", "Test USDC and gas for a demo wallet. Rate-limited."],
  ["GET", "/epochs", "Every posted $DRAFT epoch: window, root, transaction."],
  ["GET", "/epochs/:id", "One epoch’s claims and its full Merkle tree."],
  ["GET", "/epochs/claims/:account", "Every allocation to an account, with proofs."],
];

export default async function DocsPage() {
  const rules = (await api.rules()) as { version?: string; description?: string[]; minAgeDays?: number; minFills?: number; minStakedHype?: number; minVolumeUsd?: number; hubTxCount?: number } | null;

  return (
    <main className="dc">
      <div className="dc-wrap">
        <header className="dc-head">
          <p className="dc-crumbs">Docs</p>
          <h1 className="dc-title">Field notes for builders</h1>
          <p className="dc-lede">
            Everything Updraft runs on, in one page: the contracts and their addresses, the SDK, the MCP server, the widget, the public API, and what the
            system does and doesn’t guarantee.
          </p>
        </header>

        <div className="dc-grid">
          <nav className="dc-toc" aria-label="On this page">
            <p className="cap">On this page</p>
            <ol>
              {SECTIONS.map(([id, num, label]) => (
                <li key={id}>
                  <a href={`#${id}`}>
                    <span>{num}</span>
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="dc-body">
            <Sec id="what" title="One round, one buy, one price.">
              <p>
                Updraft runs fair launches on Ascend, the launchpad on Elysium (Kinetiq’s Hyperliquid L2). Instead of a race for the bottom of the curve, a
                launch gathers a round first and buys once.
              </p>
              <ol className="dc-steps">
                <li>
                  <b>Commit.</b> Before launch, anyone puts USDC into the round, up to a cap per wallet (or one place per verified Hyperliquid account in Verified
                  rounds). Commits can be withdrawn until the lock.
                </li>
                <li>
                  <b>Fire.</b> At T0 one transaction, which anyone may send, turns the whole pot into Ascend’s fee-free launch buy. Everyone, the creator
                  included, pays the same average price.
                </li>
                <li>
                  <b>Land.</b> Tokens go to every wallet; the creator’s own share vests in public, with a cliff that lasts at least as long as everyone else’s
                  schedule. Any oversubscription is refunded pro-rata.
                </li>
              </ol>
              <p>
                After launch, Ascend’s creator role sits in a vault that splits creator fees by a published policy: Ascend’s buy-support bid, holders who stake
                the token in the vault, the team, and the platform. The split moves only inside bounds fixed at launch, after a timelock. Every launch writes an
                on-chain certificate: participants, concentration, the creator’s vesting and the policy hash.
              </p>
              <p className="cap">
                Why: on Ascend testnet, 251 launches up to block 11,040,000, 49 opened with a dev-buy, and after the biggest ones the next token cost up to
                12.8× the dev’s average price. <Link href="/bottom-of-curve">The full analysis</Link>.
              </p>
            </Sec>

            <Sec id="contracts" title="Addresses on Elysium testnet.">
              <p>
                Chain id 99801. Updraft was deployed at block {d.deployBlock.toLocaleString("en-US")}. Every address links to Elysium’s explorer.
              </p>
              <div className="dc-tablewrap">
                <table className="dc-table">
                  <caption className="cap">Fig. 1. Updraft</caption>
                  <thead>
                    <tr>
                      <th scope="col">Contract</th>
                      <th scope="col">Address</th>
                      <th scope="col">What it does</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["UpdraftFactory", d.factory, "Creates rounds and checks every config against the live launchpad."],
                        ["UpdraftRound", d.roundImplementation, "Implementation each round clones: escrow, fire, distribution, refunds."],
                        ["CreatorVault", d.vaultImplementation, "Implementation each launch’s vault clones: holds the creator role, splits fees."],
                        ["LaunchCertificate", d.certificate, "One on-chain record per launch."],
                        ["UpdraftStaking", d.staking, "$DRAFT staking and the platform basket, paid by epoch."],
                        ["UpdraftLens", d.lens, "Curve previews, capacity and price after a buy."],
                        ["Attestor", d.attestor, "Signer of Verified-round vouchers (a key, not a contract)."],
                        ["Distributor", d.distributor, "Posts epoch roots (a key, not a contract)."],
                      ] as const
                    ).map(([n, a, w]) => (
                      <tr key={n}>
                        <th scope="row">{n}</th>
                        <td>
                          <Addr a={a} />
                        </td>
                        <td>{w}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="dc-tablewrap">
                <table className="dc-table">
                  <caption className="cap">Fig. 2. Ascend, as Updraft uses it</caption>
                  <thead>
                    <tr>
                      <th scope="col">Contract</th>
                      <th scope="col">Address</th>
                      <th scope="col">Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["Launchpad", ascendTestnet.launchpad, "Ascend’s curve launches; the factory only accepts this one."],
                        ["Launchpad owner", ascendTestnet.owner, "Checked at every round creation."],
                        ["Pool manager", ascendTestnet.poolManager, "Holds the pools tokens trade in after T0."],
                        ["Vault", ascendTestnet.vault, "Ascend’s settlement vault."],
                        ["USDC", ascendTestnet.usdc, "Mock testnet dollar, 6 decimals."],
                        ["mNVDAx", ascendTestnet.mnvdax, "Mock NVIDIA xStock, 18 decimals."],
                      ] as const
                    ).map(([n, a, w]) => (
                      <tr key={n}>
                        <th scope="row">{n}</th>
                        <td>
                          <Addr a={a} />
                        </td>
                        <td>{w}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Sec>

            <Sec id="sdk" title="Quickstart with @updraft/sdk.">
              <p>
                A typed client over viem. It reads rounds, previews prices, and sends every write through a simulation first, so a call the contracts would
                refuse never reaches the wallet. It lives in <span className="mono">packages/sdk</span> of the Updraft repository.
              </p>
              <Code lang="sh" fig="Fig. 3. Build the SDK.">{`
pnpm install
pnpm --filter @updraft/sdk build
`}</Code>
              <Code lang="ts" fig="Fig. 4. Create a client.">{`
import { createPublicClient, createWalletClient, custom, http, parseUnits } from "viem";
import { type Deployment, createUpdraftClient, elysiumTestnet, elysiumTestnetDeployment } from "@updraft/sdk";

const publicClient = createPublicClient({ chain: elysiumTestnet, transport: http() });
const [account] = await window.ethereum.request({ method: "eth_requestAccounts" });
const walletClient = createWalletClient({ account, chain: elysiumTestnet, transport: custom(window.ethereum) });

const updraft = createUpdraftClient({
  publicClient,
  walletClient,
  deployment: elysiumTestnetDeployment as unknown as Deployment,
  apiUrl: "${API_URL}",
});
`}</Code>
              <Code lang="ts" fig="Fig. 5. Know both addresses before anything is sent.">{`
import { ascendTestnet, predictToken } from "@updraft/sdk";
import { keccak256, toHex } from "viem";

const roundSalt = keccak256(toHex("starling, take one"));
const tokenSalt = keccak256(toHex("starling token"));
const round = await updraft.predictRound(roundSalt, account);
const token = predictToken({ launchpad: ascendTestnet.launchpad, round, tokenSalt, name: "Starling", symbol: "STRL" });

// cfg is a RoundConfig with the same tokenSalt; the factory re-checks every rule
await updraft.createRound(cfg, roundSalt);
`}</Code>
              <Code lang="ts" fig="Fig. 6. Commit.">{`
const amount = parseUnits("250", 6); // USDC has 6 decimals

// everyone's price if this were added now
const preview = await updraft.previewCommit(round, amount);

// one transaction: signs a permit when the allowance is short
await updraft.commit(round, amount);

// Verified rounds: ask the attestor for a voucher first
const voucher = await updraft.attest({ round, wallet: account });
if (voucher.ok) await updraft.commit(round, amount, voucher);
`}</Code>
              <Code lang="ts" fig="Fig. 7. Fire, from T0 until the fire-by time. Anyone can send it.">{`
const state = await updraft.getRound(round);
if (Date.now() / 1000 >= state.config.windows.closeAt) await updraft.fire(round);
`}</Code>
              <Code lang="ts" fig="Fig. 8. Claim what has vested, plus any refund.">{`
const { tokens, refund } = await updraft.claimable(round, account);
if (tokens > 0n || refund > 0n) await updraft.claim(round);

// anyone can push tokens to a range of participants
await updraft.distribute(round, 0n, 50n);
`}</Code>
            </Sec>

            <Sec id="mcp" title="The MCP server.">
              <p>
                <span className="mono">updraft-mcp</span> exposes Updraft to any MCP client. Read tools query the chain and the API; build tools return unsigned
                transactions only. It never holds a key and never signs.
              </p>
              <Code lang="sh" fig="Fig. 9. Run it over stdio, or over Streamable HTTP.">{`
pnpm --filter @updraft/mcp build

updraft-mcp                 # stdio
updraft-mcp --http 8787     # HTTP at http://localhost:8787/mcp

# optional environment
# ELYSIUM_RPC=<rpc url>
# UPDRAFT_API=${API_URL}
`}</Code>
              <Code lang="json" fig="Fig. 10. A client entry for the stdio server.">{`
{
  "mcpServers": {
    "updraft": {
      "command": "updraft-mcp",
      "env": { "UPDRAFT_API": "${API_URL}" }
    }
  }
}
`}</Code>
              <div className="dc-tablewrap">
                <table className="dc-table">
                  <caption className="cap">Fig. 11. Tools</caption>
                  <thead>
                    <tr>
                      <th scope="col">Tool</th>
                      <th scope="col">Kind</th>
                      <th scope="col">Returns</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TOOLS.map(([n, k, w]) => (
                      <tr key={n}>
                        <th scope="row" className="mono">
                          {n}
                        </th>
                        <td>{k === "read" ? "read-only" : "unsigned tx"}</td>
                        <td>{w}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="dc-note">Every tool that takes a round checks first that the factory created it, so an impostor contract can’t steer an approval to itself.</p>
            </Sec>

            <Sec id="widget" title="Embed a round on any page.">
              <p>One script tag. It is replaced by a frame showing the round live, and the frame grows to fit what it shows.</p>
              <Code lang="html" fig="Fig. 12. The embed. data-round is the round’s address.">{`
<script src="https://<app>/updraft-widget.js" data-round="0x…"></script>
`}</Code>
              <p>
                The frame loads <span className="mono">/embed/round/&lt;address&gt;</span> from the same origin as the script. To serve the script from somewhere
                else, add <span className="mono">data-app=&quot;https://&lt;app&gt;&quot;</span>. The script is under a kilobyte, and it only accepts height
                messages from its own frame.
              </p>
            </Sec>

            <Sec id="api" title="Public endpoints.">
              <p>Both services are open, read-mostly, and return JSON with amounts as decimal strings.</p>
              <div className="dc-tablewrap">
                <table className="dc-table dc-ep">
                  <caption className="cap">
                    Fig. 13. Indexer, <span className="mono">{host(INDEXER_URL)}</span>
                  </caption>
                  <tbody>
                    {INDEXER.map(([m, p, w]) => (
                      <tr key={p}>
                        <td>
                          <span className={`dc-verb ${m.toLowerCase()}`}>{m}</span>
                        </td>
                        <th scope="row" className="mono">
                          {p}
                        </th>
                        <td>{w}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="dc-tablewrap">
                <table className="dc-table dc-ep">
                  <caption className="cap">
                    Fig. 14. API, <span className="mono">{host(API_URL)}</span>
                  </caption>
                  <tbody>
                    {API.map(([m, p, w]) => (
                      <tr key={p}>
                        <td>
                          <span className={`dc-verb ${m.toLowerCase()}`}>{m}</span>
                        </td>
                        <th scope="row" className="mono">
                          {p}
                        </th>
                        <td>{w}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Sec>

            <Sec id="verified" title="Rules for Verified rounds.">
              <p>
                In a Verified round, each place belongs to one Hyperliquid account. Before a wallet’s first commit, the attestor reads the account’s public
                history, applies these rules, and signs a voucher for that round and wallet only. The inputs to every decision are hashed and published at{" "}
                <span className="mono">/evidence/:hash</span>.
              </p>
              {rules?.description ? (
                <ol className="dc-rules">
                  {rules.description.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ol>
              ) : (
                <p className="dc-note">The rules service didn’t answer while this page was built.</p>
              )}
              <p className="cap">
                Fig. 15. Rules {rules?.version ?? "v1"}, live from{" "}
                <a href={`${API_URL}/rules/v1`} target="_blank" rel="noreferrer">
                  {host(API_URL)}/rules/v1
                </a>
                .
              </p>
            </Sec>

            <Sec id="failsafes" title="When a round doesn’t fire.">
              <p>A round either fires cleanly or gives the money back. There is no half-launch, and no state where funds wait on anyone’s good will.</p>
              <ul className="dc-fails">
                <li>
                  <span>Below minimum</span>Less than the minimum raise is in at T0. Anyone can abort, and every commit is refunded.
                </li>
                <li>
                  <span>Deadline missed</span>Nobody fires before the fire-by time, at most 7 days after T0. The round aborts and refunds.
                </li>
                <li>
                  <span>Ascend changed</span>The launchpad’s curve for the quote changed since the round was created, Ascend stopped accepting the quote, or the
                  factory revoked the launchpad. Fire aborts instead of buying on terms nobody signed up for.
                </li>
                <li>
                  <span>Launch fails</span>If Ascend’s launch call fails, fire reverts and the round stays live, so anyone can send it
                  again. A failed launch never ends a round, so nobody can end one by making it fail; if it never succeeds, the fire-by
                  time refunds everyone.
                </li>
                <li>
                  <span>Ascend paused</span>Fire waits. It can be sent again once Ascend unpauses, until the fire-by time.
                </li>
                <li>
                  <span>Escrow short</span>If the round holds less than it was given, new commits wait, withdrawals carry their pro-rata share of the loss, and
                  refunds pay out pro-rata of what the round actually holds.
                </li>
              </ul>
            </Sec>

            <Sec id="limits" title="Honest limits.">
              <ul className="dc-limits">
                <li>
                  <b>Testnet only.</b> Everything here runs on Elysium testnet. There is no mainnet deployment.
                </li>
                <li>
                  <b>Testnet stables are mocks.</b> Anyone can mint or burn Ascend’s testnet USDC and mNVDAx. The contracts account by the balances they actually
                  hold, never by what they were told, so a burned balance is shared pro-rata instead of stranding someone.
                </li>
                <li>
                  <b>The attestor is a trusted signer.</b> Verified rounds rely on it for one account, one place. Open rounds don’t use it at all.
                </li>
                <li>
                  <b>Epoch roots come from our distributor key</b> (<span className="mono">{d.distributor.slice(0, 10)}…</span>). Anyone can recompute each root
                  from the staking contract’s public events and check it against the published tree. Staked principal never depends on the root.
                </li>
                <li>
                  <b>Identity checks aren’t trustless yet.</b> Elysium’s HyperCore precompile, which would let contracts read Hyperliquid history directly, arrives
                  after mainnet.
                </li>
                <li>
                  <b>No third-party audit.</b> A self-audit found 15 issues (1 critical, 2 high, 5 medium, 5 low, 2 informational). All 15 are fixed.
                </li>
                <li>
                  <b>Ascend doesn’t read the certificate.</b> It is written on-chain for anyone to check; Ascend using it is on the roadmap, not live.
                </li>
              </ul>
            </Sec>
          </article>
        </div>
      </div>
    </main>
  );
}
