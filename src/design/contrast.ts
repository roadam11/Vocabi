/** WCAG 2.x contrast helpers used by the token contrast test. */

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Expected #RRGGBB, got "${hex}"`);
  const n = parseInt(m[1]!, 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

type Tokens = Record<string, string>;

function colorDeclarations(block: string): Tokens {
  const out: Tokens = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]!] = m[2]!;
  return out;
}

/** Body of the first `{…}` block whose selector text matches `selector` exactly (no nested braces). */
function block(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`tokens.css: selector "${selector}" not found`);
  const open = css.indexOf("{", start);
  return css.slice(open + 1, css.indexOf("}", open));
}

/**
 * Reads the hex color tokens of each theme from tokens.css:
 * light = `:root`, dark = system dark (`:root:not([data-theme="light"])` inside the media query),
 * darkManual = `[data-theme="dark"]`, lightManual = `[data-theme="light"]` (scoped subtrees).
 */
export function parseThemeTokens(css: string): {
  light: Tokens;
  dark: Tokens;
  darkManual: Tokens;
  lightManual: Tokens;
} {
  return {
    light: colorDeclarations(block(css, ":root")),
    dark: colorDeclarations(block(css, ':root:not([data-theme="light"])')),
    darkManual: colorDeclarations(block(css, '[data-theme="dark"]')),
    lightManual: colorDeclarations(block(css, '[data-theme="light"]')),
  };
}
