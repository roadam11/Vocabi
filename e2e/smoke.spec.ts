import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("home page renders in Hebrew RTL", async ({ page }) => {
  await page.goto("/");

  const html = page.locator("html");
  await expect(html).toHaveAttribute("dir", "rtl");
  await expect(html).toHaveAttribute("lang", "he");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // English fragments are bidi-isolated (docs/DECISIONS.md #23).
  await expect(page.locator('bdi[dir="ltr"][lang="en"]').first()).toBeVisible();

  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("home-390x844.png", { fullPage: true });
});
