import { expect, type Locator, type Page, test } from "@playwright/test";
import { he } from "../src/i18n/he";

const viewports = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];
const schemes = ["light", "dark"] as const;

// Token values from src/app/tokens.css, as computed rgb().
const BG = { light: "rgb(247, 244, 236)", dark: "rgb(18, 17, 16)" };
const ACCENT = { light: "rgb(103, 112, 66)", dark: "rgb(169, 179, 119)" };

/** Waits until React hydrated (the theme toggle reflects the current preference). */
async function hydrated(page: Page) {
  await expect(page.locator('input[type="radio"]:checked')).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);
}

const bodyBg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe("/design screenshots", () => {
  for (const viewport of viewports) {
    for (const colorScheme of schemes) {
      const name = `design-${viewport.width}x${viewport.height}-${colorScheme}`;
      test(name, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme });
        await page.goto("/design");
        await hydrated(page);
        expect(await bodyBg(page)).toBe(BG[colorScheme]);
        await expect(page).toHaveScreenshot(`${name}.png`, {
          fullPage: true,
          animations: "disabled",
        });
      });
    }
  }

  test("is not indexed", async ({ page }) => {
    await page.goto("/design");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});

test.describe("theme without flash", () => {
  /**
   * App JS is blocked, so React never hydrates: anything applied here comes from the inline
   * <head> script. The init script also records whether <body> existed when data-theme was set
   * (it must not: the attribute has to be in place before the body is parsed and painted).
   */
  async function loadWithoutAppJs(page: Page, stored: string | null) {
    await page.addInitScript((value) => {
      if (value) localStorage.setItem("vocabi-theme", value);
      else localStorage.removeItem("vocabi-theme");
      const w = window as unknown as { __themeSetWithBody?: boolean };
      new MutationObserver(() => {
        w.__themeSetWithBody ??= document.body !== null;
      }).observe(document, { subtree: true, attributeFilter: ["data-theme"] });
    }, stored);
    await page.route("**/_next/static/**/*.js", (route) => route.abort());
    await page.goto("/design");
  }

  const setWithBody = (page: Page) =>
    page.evaluate(() => (window as unknown as { __themeSetWithBody?: boolean }).__themeSetWithBody);

  test("stored dark + OS light → dark before first paint", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await loadWithoutAppJs(page, "dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await setWithBody(page)).toBe(false);
    expect(await bodyBg(page)).toBe(BG.dark);
  });

  test("stored light + OS dark → light before first paint", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await loadWithoutAppJs(page, "light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await setWithBody(page)).toBe(false);
    expect(await bodyBg(page)).toBe(BG.light);
  });

  test("no override → follows the system (dark), no attribute", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await loadWithoutAppJs(page, null);
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);
    expect(await bodyBg(page)).toBe(BG.dark);
  });

  test("corrupted value → system", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await loadWithoutAppJs(page, "purple");
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);
    expect(await bodyBg(page)).toBe(BG.light);
  });

  test("toggle choice persists across reload and system clears it", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/design");
    await hydrated(page);
    await page.locator("label", { hasText: he.theme.dark }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.reload();
    await hydrated(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("radio", { name: he.theme.dark })).toBeChecked();
    expect(await bodyBg(page)).toBe(BG.dark);

    await page.locator("label", { hasText: he.theme.system }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);
    expect(await page.evaluate(() => localStorage.getItem("vocabi-theme"))).toBeNull();
  });
});

test.describe("keyboard-only walkthrough", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  /** Presses Tab until `target` has focus (keyboard only), failing after `max` presses. */
  async function tabTo(page: Page, target: Locator, max = 250) {
    for (let i = 0; i < max; i++) {
      if (await target.evaluate((el) => el === document.activeElement)) return;
      await page.keyboard.press("Tab");
    }
    throw new Error(`Tab never reached ${target}`);
  }

  /** The focused control (or, for a visually hidden radio, its label) shows the accent ring. */
  async function expectFocusRing(page: Page, el: Locator, scheme: "light" | "dark" = "light") {
    const ring = await el.evaluate((node) => {
      const target = node.matches(".sr-only") ? node.closest("label")! : node;
      const cs = getComputedStyle(target);
      return {
        style: cs.outlineStyle,
        width: cs.outlineWidth,
        offset: cs.outlineOffset,
        color: cs.outlineColor,
      };
    });
    expect(ring).toEqual({ style: "solid", width: "2px", offset: "2px", color: ACCENT[scheme] });
  }

  test("theme toggle, primary button, choices 1-4, answer input, sheet", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/design");
    await hydrated(page);
    const html = page.locator("html");

    // 1. Theme toggle: first tab stop; arrow keys move through system → light → dark → system.
    const system = page.getByRole("radio", { name: he.theme.system });
    await tabTo(page, system);
    await expectFocusRing(page, system);
    await page.keyboard.press("ArrowDown");
    await expect(html).toHaveAttribute("data-theme", "light");
    await page.keyboard.press("ArrowDown");
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expectFocusRing(page, page.getByRole("radio", { name: he.theme.dark }), "dark");
    await page.keyboard.press("ArrowDown");
    await expect(html).not.toHaveAttribute("data-theme", /.*/);

    // 2. Primary (accent-filled) button: the ring is offset, so it is visible against the page.
    const primary = page
      .locator("#button [data-variant-row='primary'] button[data-variant='primary']")
      .first();
    await tabTo(page, primary);
    await expectFocusRing(page, primary);
    // Row screenshot: an element screenshot of the button alone would clip the offset ring.
    await expect(page.locator("#button [data-variant-row='primary']")).toHaveScreenshot(
      "focus-primary-button.png",
      { animations: "disabled" },
    );

    // 3. ChoiceList: key 2 answers (wrong), result is announced; further keys are ignored.
    const interactive = page.getByTestId("choice-interactive");
    const feedback = interactive.getByTestId("choice-feedback");
    await expect(feedback).toHaveAttribute("aria-live", "polite");
    await page.keyboard.press("2");
    await expect(feedback).toContainText(he.ds.choiceList.wrong);
    await expect(feedback).toContainText(he.design.samples.choiceA);
    await page.keyboard.press("1");
    await expect(feedback).toContainText(he.ds.choiceList.wrong);
    await expect(interactive.locator("button[data-state='wrong']")).toHaveCount(1);
    // Reset with the keyboard, then key 1 answers correctly.
    const reset = interactive.getByRole("button", { name: he.design.samples.reset });
    await tabTo(page, reset);
    await expectFocusRing(page, reset);
    await page.keyboard.press("Enter");
    await expect(feedback).toHaveText("");
    await page.keyboard.press("1");
    await expect(feedback).toContainText(he.ds.choiceList.correct);

    // 4. AnswerInput: Enter on empty shows the error; typing + Enter submits.
    const input = page.locator("#answer-input input").first();
    await tabTo(page, input);
    await expectFocusRing(page, input);
    await page.keyboard.press("Enter");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(
      page.locator("#answer-input").getByText(he.ds.answerInput.empty).first(),
    ).toBeVisible();
    await page.keyboard.type("ignore");
    await page.keyboard.press("Enter");
    await expect(page.getByText(he.design.samples.submitted)).toBeVisible();

    // 5. Sheet: Enter opens, Tab stays inside, Esc closes and focus returns to the opener.
    const opener = page.getByRole("button", { name: he.design.samples.openSheet });
    await tabTo(page, opener);
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: he.design.samples.sheetTitle });
    await expect(dialog).toBeVisible();
    for (const key of ["Tab", "Tab", "Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab"]) {
      await page.keyboard.press(key);
      expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });
});

test.describe("edge cases", () => {
  test("long Hebrew wraps without horizontal overflow at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/design");
    await hydrated(page);
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    const overflowing = await page
      .getByTestId("wrap-box")
      .evaluate(
        (box) =>
          [box, ...box.querySelectorAll("*")].filter((el) => el.scrollWidth > el.clientWidth + 1)
            .length,
      );
    expect(overflowing).toBe(0);
    await expect(page.locator("#wrap")).toHaveScreenshot("wrap-320.png");
  });

  test("a Hebrew sentence with English words keeps the reading order", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/design");
    await hydrated(page);
    const sentence = page.getByTestId("bidi-sentence");
    const words = sentence.locator('bdi[dir="ltr"][lang="en"]');
    await expect(words).toHaveText(["ubiquitous", "get along with"]);
    // RTL: on one line, the earlier English word sits to the right of the later one.
    const [a, b] = [await words.nth(0).boundingBox(), await words.nth(1).boundingBox()];
    expect(a && b && Math.abs(a.y - b.y) < 2).toBe(true);
    expect(a!.x).toBeGreaterThan(b!.x);
    await expect(sentence).toHaveScreenshot("bidi-sentence.png");
  });

  test("directional icons mirror in RTL, non-directional ones do not", async ({ page }) => {
    await page.goto("/design");
    const scaleOf = (name: string) =>
      page.locator(`#icons [data-icon="${name}"]`).evaluate((el) => getComputedStyle(el).scale);
    for (const name of ["chevron-next", "arrow-next", "arrow-back"])
      expect(await scaleOf(name)).toBe("-1 1");
    for (const name of ["play", "speaker", "check", "x"]) expect(await scaleOf(name)).toBe("none");
  });

  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    test(`word card flip with reduced motion: ${reducedMotion}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
      await page.goto("/design");
      await hydrated(page);
      const card = page.getByTestId("flip-card");
      const flip = card.locator("[data-flip]");
      await card.getByRole("button", { name: he.design.samples.flip }).click();
      await expect(flip).toHaveAttribute("data-flip", "back");
      const style = await flip.evaluate((el) => ({
        transform: getComputedStyle(el).transform,
        rotate: getComputedStyle(el).rotate,
        duration: parseFloat(getComputedStyle(el).transitionDuration) * 1000,
      }));
      if (reducedMotion === "reduce") {
        expect(style.transform).toBe("none");
        expect(style.duration).toBeLessThanOrEqual(100);
        // The hidden (front) face fades out instead of flipping away.
        await expect(card.locator('[data-face="front"]')).toHaveCSS("opacity", "0");
      } else {
        expect(style.transform).not.toBe("none");
        expect(style.duration).toBe(400);
      }
      // Only the visible face is reachable.
      await expect(card.locator('[data-face="front"]')).toHaveAttribute("inert", "");
    });
  }

  test("keys 1-4 do not answer behind an open Sheet", async ({ page }) => {
    await page.goto("/design");
    await hydrated(page);
    await page.getByRole("button", { name: he.design.samples.openSheet }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("1");
    await page.keyboard.press("Escape");
    const feedback = page.getByTestId("choice-interactive").getByTestId("choice-feedback");
    await expect(feedback).toHaveText("");
    // Without the sheet the same key answers, and each option exposes its result as text.
    await page.keyboard.press("2");
    const interactive = page.getByTestId("choice-interactive");
    await expect(interactive.locator("button[data-state='wrong']")).toContainText(
      he.ds.choiceList.chosenOption,
    );
    await expect(interactive.locator("button[data-state='correct']")).toContainText(
      he.ds.choiceList.correctOption,
    );
  });

  test("text at 200% does not overflow horizontally (390px)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/design");
    await hydrated(page);
    await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    const card = page.getByTestId("flip-long").locator('[data-face="front"]');
    const box = await card.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(clientWidth);
  });

  test("example sentences render upright, never synthesized italic", async ({ page }) => {
    await page.goto("/design");
    const example = page.getByText("She chose to ignore the noise").first();
    await expect(example).toHaveCSS("font-style", "normal");
    await expect(example).toHaveCSS("font-synthesis-style", "none");
  });

  test("a toast stays while its dismiss button has focus", async ({ page }) => {
    await page.clock.install();
    await page.goto("/design");
    await hydrated(page);
    await page.getByRole("button", { name: he.design.samples.showToast }).click();
    const region = page.locator('[role="status"][aria-live="polite"].fixed');
    const dismiss = region.getByRole("button", { name: he.ds.toast.dismiss });
    await dismiss.focus();
    await page.clock.runFor(10_000);
    await expect(region).toContainText(he.design.samples.toastSuccess);
    await expect(dismiss).toBeFocused();
    // Once focus leaves, it auto-dismisses.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.clock.runFor(6_000);
    await expect(region).not.toContainText(he.design.samples.toastSuccess);
  });
});
