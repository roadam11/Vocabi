import { expect, test } from "@playwright/test";

// docs/DESIGN.md "Visual verification": mobile and desktop, light and dark.
const viewports = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];

for (const viewport of viewports) {
  for (const colorScheme of ["light", "dark"] as const) {
    const name = `home-${viewport.width}x${viewport.height}-${colorScheme}`;

    test.describe(name, () => {
      test.use({ viewport, colorScheme });

      test("home page renders in Hebrew RTL", async ({ page }) => {
        await page.goto("/");

        const html = page.locator("html");
        await expect(html).toHaveAttribute("dir", "rtl");
        await expect(html).toHaveAttribute("lang", "he");
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

        // English fragments are bidi-isolated (docs/DECISIONS.md #23).
        await expect(page.locator('bdi[dir="ltr"][lang="en"]').first()).toBeVisible();

        await page.evaluate(() => document.fonts.ready);
        await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true });
      });
    });
  }
}
