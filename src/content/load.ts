import { join } from "node:path";
import type { z } from "zod";
import { type ContentKind, readContent } from "./read";
import { LexiconEntry, PlacementBands, PlacementItem, Pseudoword, Sense, Track } from "./schema";

export type LoadOptions = {
  /** Content root; defaults to `<cwd>/content`. */
  root?: string;
  /** Include devOnly fixtures (docs/DECISIONS.md #10). Defaults to development builds only. */
  includeDevOnly?: boolean;
};

export type LoadedContent = {
  senses: Sense[];
  lexicon: LexiconEntry[];
  placementItems: PlacementItem[];
  pseudowords: Pseudoword[];
  /** Track order restricted to the senses that actually loaded. */
  tracks: Track[];
  /** Placement band sizes in lemmas (docs/DECISIONS.md #31); null until the file exists. */
  bands: PlacementBands | null;
};

type Gated = { verification: { status: string }; devOnly?: boolean };

/** Only verified records load; devOnly ones only when asked (docs/CONTENT.md). */
export function selectLoadable<T extends Gated>(
  records: readonly T[],
  { includeDevOnly }: { includeDevOnly: boolean },
): T[] {
  return records.filter(
    (r) => r.verification.status === "verified" && (includeDevOnly || r.devOnly !== true),
  );
}

const SCHEMAS = {
  sense: Sense,
  lexicon: LexiconEntry,
  placementItem: PlacementItem,
  pseudoword: Pseudoword,
  track: Track,
  bands: PlacementBands,
} satisfies Record<ContentKind, z.ZodType>;

/**
 * Loads typed content. Content that fails its schema throws: `pnpm content:check` is the gate that
 * keeps invalid content from shipping, so reaching this with bad data is a build error.
 */
export function loadContent(opts: LoadOptions = {}): LoadedContent {
  const root = opts.root ?? join(process.cwd(), "content");
  const includeDevOnly = opts.includeDevOnly ?? process.env.NODE_ENV === "development";
  const { records, fileErrors } = readContent(root);
  if (fileErrors.length > 0) {
    throw new Error(
      `content: ${fileErrors[0]!.file}: ${fileErrors[0]!.message} (run pnpm content:check)`,
    );
  }

  function parsed<K extends ContentKind>(kind: K): z.infer<(typeof SCHEMAS)[K]>[] {
    return records
      .filter((r) => r.kind === kind)
      .map((r) => {
        const result = SCHEMAS[kind].safeParse(r.value);
        if (!result.success) {
          throw new Error(`content: ${r.file}[${r.index}] is invalid (run pnpm content:check)`);
        }
        return result.data as z.infer<(typeof SCHEMAS)[K]>;
      });
  }

  const senses = selectLoadable(parsed("sense"), { includeDevOnly });
  const ids = new Set(senses.map((s) => s.id));
  return {
    senses,
    lexicon: selectLoadable(parsed("lexicon"), { includeDevOnly }),
    placementItems: parsed("placementItem"),
    pseudowords: parsed("pseudoword"),
    tracks: parsed("track").map((t) => ({ ...t, order: t.order.filter((id) => ids.has(id)) })),
    bands: parsed("bands")[0] ?? null,
  };
}
