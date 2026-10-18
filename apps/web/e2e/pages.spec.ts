import { expect, test } from "@playwright/test";

// Every page renders from live data, without errors and without sideways scrolling.
const pages: [string, RegExp][] = [
  ["/", /Everyone lands/],
  ["/bottom-of-curve", /bottom of the curve/i],
  ["/rounds", /one price for everyone/],
  ["/rounds/0xD4d5F75D7abDEb644586721870fE4cf92F28bDF6", /Updraft Rehearsal One/],
  ["/certificate/0x9B63bca41cd75A4471bea8CFEad882c11f1702Bb", /Updraft Rehearsal One/],
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
  await page.goto("/rounds/0xEf4f1b9E58bDAbDEf9b157A1EA1375fE699FCE8c");
  await expect(page.getByText(/5\.13× fewer tokens per USDC/)).toBeVisible({ timeout: 30_000 });
});
