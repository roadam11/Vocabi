import type { Metadata, Viewport } from "next";
import { Frank_Ruhl_Libre, Fraunces, Heebo, Newsreader } from "next/font/google";
import type { ReactNode } from "react";
import { he } from "@/i18n/he";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

// docs/DESIGN.md "Typography". CSS variables are --nf-* so they never collide with Tailwind's
// --font-* theme namespace; roles (font-sans, font-display-he, font-en-serif) are in globals.css.
const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--nf-heebo",
});

const frankRuhl = Frank_Ruhl_Libre({
  subsets: ["hebrew", "latin"],
  weight: ["500", "700", "900"],
  display: "swap",
  variable: "--nf-frank-ruhl",
  preload: false,
});

// Both Latin serif candidates stay loadable; tokens.css --en-serif picks one (one-line switch).
// Not preloaded: files are fetched only where the font is actually used.
const newsreader = Newsreader({
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
  variable: "--nf-newsreader",
  preload: false,
});

const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
  variable: "--nf-fraunces",
  preload: false,
});

export const metadata: Metadata = {
  title: he.meta.title,
  description: he.meta.description,
};

// docs/DESIGN.md: never disable zoom (no maximumScale / userScalable).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const fontVariables = [heebo, frankRuhl, newsreader, fraunces].map((f) => f.variable).join(" ");

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // suppressHydrationWarning: the inline script may set data-theme before React hydrates.
    <html lang="he" dir="rtl" className={fontVariables} suppressHydrationWarning>
      <head>
        {/* Runs before first paint: applies the saved theme override (no flash). src/lib/theme.ts */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
