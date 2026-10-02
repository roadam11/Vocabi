import { En } from "@/components/ds/En";
import { he } from "@/i18n/he";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[35rem] flex-col justify-center gap-4 px-6 py-12">
      <p className="text-sm font-medium tracking-widest">
        <En>{he.home.brand}</En>
      </p>
      <h1 className="text-3xl leading-tight font-bold">{he.home.heading}</h1>
      <p className="text-lg">{he.home.tagline}</p>
      <p className="text-base">{he.home.comingSoon}</p>
    </main>
  );
}
