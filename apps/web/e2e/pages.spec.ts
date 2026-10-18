import { expect, test } from "@playwright/test";

// Every page renders from live data, without errors and without sideways scrolling.
const pages: [string, RegExp][] = [
  ["/", /Everyone lands/],
  ["/bottom-of-curve", /bottom of the curve/i],
  ["/rounds", /one price for everyone/],
  ["/rounds/0xD5dF4e0537b171f05D415d7BDC0B6345f0815421", /Updraft Rehearsal One/],
  ["/certificate/0xc8f59d265A064bcB20a2F8bf3027AEA502B9e0cA", /Updraft Rehearsal One/],
  ["/studio", /./],
  ["/stake", /DRAFT/],
  ["/docs", /./],
];

for (const [path, heading] of pages) {
  test(`renders ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(path);
    await expect(page.locator("h1").first()).toHaveText(heading);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}

test("the sniper comparison is read from the chain", async ({ page }) => {
  await page.goto("/rounds/0x15f436B0D9A917179Fc5DD390072AD46Ed7aC03b");
  await expect(page.getByText(/5\.13× fewer tokens per USDC/)).toBeVisible({ timeout: 30_000 });
});
