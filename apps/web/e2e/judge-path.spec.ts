import { type Page, expect, test } from "@playwright/test";
import { type Address, type Hex, createPublicClient, erc20Abi, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { elysiumTestnet, updraftRoundAbi } from "@updraft/sdk";

// The path a visitor takes with nothing installed, on Elysium testnet, against the live services:
// a creator opens a two-minute round in the studio, someone else commits, the keeper fires it at T0,
// the tokens land in the committer's wallet at the round's price, and the certificate is there.
// E2E_CREATOR_KEY is the creator's demo-wallet key (funded with a little HYPE for gas): the app
// labels that wallet's rounds as ours.
const RPC = process.env.E2E_RPC ?? "https://testnet-rpc.elysium.kinetiq.xyz";
const chain = { ...elysiumTestnet, rpcUrls: { default: { http: [RPC] } } };
const client = createPublicClient({ chain, transport: http(RPC, { retryCount: 5, retryDelay: 1_500 }) });

async function demoAddress(page: Page): Promise<Address> {
  const key = await page.evaluate(() => localStorage.getItem("updraft.demo-wallet"));
  if (!key) throw new Error("no demo wallet in this browser");
  return privateKeyToAccount(key as Hex).address;
}

test("a visitor with no wallet launches a round, another commits, both land at one price", async ({ browser }) => {
  const creatorKey = process.env.E2E_CREATOR_KEY;
  test.skip(!creatorKey, "set E2E_CREATOR_KEY to run against testnet");
  test.setTimeout(10 * 60_000);
  const symbol = `E${Date.now().toString(36).slice(-5).toUpperCase()}`;

  // The creator: a demo wallet opens a round with a one-minute lock and T0 a minute later.
  const creatorContext = await browser.newContext();
  await creatorContext.addInitScript((key) => localStorage.setItem("updraft.demo-wallet", key), creatorKey!);
  const creator = await creatorContext.newPage();
  await creator.goto("/studio");

  await creator.locator("#sd-name").fill(`Updraft E2E ${symbol}`);
  await creator.locator("#sd-symbol").fill(symbol);
  await creator.getByRole("button", { name: /^Next:/ }).click();
  await creator.locator("#sd-lock").fill("1");
  await creator.locator("#sd-lock").locator("..").locator("select").selectOption("m");
  await creator.locator("#sd-t0").fill("1");
  await creator.locator("#sd-t0").locator("..").locator("select").selectOption("m");
  await creator.getByRole("button", { name: /^Next:/ }).click();
  await creator.locator("#sd-minRaise").fill("100");
  await creator.locator("#sd-creatorCap").fill("0");
  for (let i = 0; i < 4; i++) await creator.getByRole("button", { name: /^Next:/ }).click();

  const create = creator.getByRole("button", { name: "Create round" });
  await expect(create).toBeEnabled({ timeout: 60_000 });
  await create.click();
  const open = creator.locator('a.btn[href^="/rounds/0x"]');
  await expect(open).toBeVisible({ timeout: 120_000 });
  const round = (await open.getAttribute("href"))!.split("/").pop() as Address;

  // A participant in a fresh browser: demo wallet, then a 250 USDC commit with one signature.
  const participant = await (await browser.newContext()).newPage();
  await participant.goto(`/rounds/${round}`);
  await participant.getByRole("button", { name: "Try with a demo wallet" }).click();
  const wallet = await expect
    .poll(() => participant.evaluate(() => !!localStorage.getItem("updraft.demo-wallet")), { timeout: 30_000 })
    .toBe(true)
    .then(() => demoAddress(participant));
  await expect
    .poll(
      async () => client.readContract({ address: "0x84Cc00D13173f7016Bbab22A736dBf75A154cFE2", abi: erc20Abi, functionName: "balanceOf", args: [wallet] }),
      { timeout: 90_000, intervals: [3_000] },
    )
    .toBeGreaterThan(0n);
  await participant.locator("#amt").fill("250");
  await participant.getByRole("button", { name: "Commit 250 USDC" }).click();
  await expect
    .poll(() => client.readContract({ address: round, abi: updraftRoundAbi, functionName: "commitOf", args: [wallet] }), {
      timeout: 120_000,
      intervals: [3_000],
    })
    .toBe(250_000_000n);

  // Nobody here sends fire(): the keeper does at T0, then pushes the tokens out.
  await expect
    .poll(() => client.readContract({ address: round, abi: updraftRoundAbi, functionName: "status" }), {
      timeout: 6 * 60_000,
      intervals: [10_000],
    })
    .toBe(1);
  const token = await client.readContract({ address: round, abi: updraftRoundAbi, functionName: "token" });
  const net = await client.readContract({ address: round, abi: updraftRoundAbi, functionName: "netTokens" });
  await expect
    .poll(() => client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }), {
      timeout: 3 * 60_000,
      intervals: [10_000],
    })
    .toBe(net);

  await participant.reload();
  await expect(participant.getByText("Fired", { exact: true }).first()).toBeVisible({ timeout: 30_000 });

  const certificate = await (await browser.newContext()).newPage();
  await certificate.goto(`/certificate/${token}`);
  await expect(certificate.locator("h1").first()).toHaveText(new RegExp(`Updraft E2E ${symbol}`), { timeout: 30_000 });
});
