import type { Metadata } from "next";
import { he } from "@/i18n/he";
import { DesignShowcase } from "./Showcase";

// Internal page: every ds component in every state (docs/DESIGN.md). Never indexed.
export const metadata: Metadata = {
  title: he.design.title,
  robots: { index: false, follow: false },
};

export default function DesignPage() {
  return <DesignShowcase />;
}
