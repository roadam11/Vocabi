import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import type { ReactNode } from "react";
import { he } from "@/i18n/he";
import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--nf-heebo",
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

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
