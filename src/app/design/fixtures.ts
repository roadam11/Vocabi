/** English sample content for the /design showcase (content, not UI copy — Hebrew lives in he.ts). */
export const sampleWords = {
  ignore: {
    headword: "ignore",
    pos: "verb",
    example: "She chose to ignore the noise and kept reading.",
  },
  resilient: {
    headword: "resilient",
    pos: "adjective",
    example: "Children are often more resilient than adults expect.",
  },
  long: {
    headword: "incomprehensibilities",
    pos: "noun",
    example:
      "The report listed several incomprehensibilities in the contract, each one longer than the last.",
  },
} as const;

export const serifCandidates = [
  { name: "Newsreader", className: "font-newsreader" },
  { name: "Fraunces", className: "font-fraunces" },
] as const;

export const serifSampleWords = ["ignore", "resilient", "thorough"] as const;

export const mixedSentenceWords = { word: "ubiquitous", phrase: "get along with" } as const;

export const tokenSwatches = [
  { name: "--bg", className: "bg-bg" },
  { name: "--surface", className: "bg-surface" },
  { name: "--surface-2", className: "bg-surface-2" },
  { name: "--ink", className: "bg-ink" },
  { name: "--ink-2", className: "bg-ink-2" },
  { name: "--line", className: "bg-line" },
  { name: "--line-strong", className: "bg-line-strong" },
  { name: "--accent", className: "bg-accent" },
  { name: "--accent-soft", className: "bg-accent-soft" },
  { name: "--on-accent", className: "bg-on-accent" },
  { name: "--success", className: "bg-success" },
  { name: "--success-soft", className: "bg-success-soft" },
  { name: "--danger", className: "bg-danger" },
  { name: "--danger-soft", className: "bg-danger-soft" },
] as const;
