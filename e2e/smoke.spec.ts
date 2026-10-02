import { expect, test } from "@playwright/test";

// docs/DESIGN.md "Visual verification": mobile and desktop. Dark mode arrives with tokens in M2.
const viewports = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];

for (const viewport of viewports) {
  const size = `${viewport.width}x${viewport.height}`;

  test.describe(size, () => {
    test.use({ viewport });

    test("home page renders in Hebrew RTL", async ({ page }) => {
      await page.goto("/");

      const html = page.locator("html");
      await expect(html).toHaveAttribute("dir", "rtl");
      await expect(html).toHaveAttribute("lang", "he");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      // English fragments are bidi-isolated (docs/DECISIONS.md #23).
      await expect(page.locator('bdi[dir="ltr"][lang="en"]').first()).toBeVisible();

      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`home-${size}.png`, { fullPage: true });
    });
  });
}
