import type { ReactNode } from "react";
import { he } from "@/i18n/he";
import { cx } from "@/lib/cx";
import { Button } from "./Button";
import { Card } from "./Card";
import { Chip } from "./Chip";
import { En } from "./En";
import { IconSpeaker } from "./icons";

export type WordCardProps = {
  /** English headword. */
  headword: string;
  /** English part of speech, e.g. "verb". */
  pos: string;
  /** Hebrew meaning (content, not UI copy). */
  meaning: string;
  /** English example sentence. */
  example?: string;
  /** Plays the word; the audio button is hidden when omitted (e.g. no en-US voice). */
  onPlay?: () => void;
  /**
   * Flip mode: `false` shows the front (headword), `true` flips to the back (meaning + example).
   * Omit for a static card showing everything. Reduced motion: no 3D flip, a ≤100ms crossfade.
   */
  revealed?: boolean;
  className?: string;
};

function Headword({ headword, small = false }: { headword: string; small?: boolean }) {
  return (
    <En
      className={cx(
        // min-w-0: inside the centering flex row a long word must shrink and wrap, not overflow.
        "block min-w-0 max-w-full font-en-serif leading-tight font-medium break-words text-ink",
        small ? "text-2xl" : "text-[2.5rem] sm:text-5xl",
      )}
    >
      {headword}
    </En>
  );
}

function TopRow({ pos, onPlay }: Pick<WordCardProps, "pos" | "onPlay">) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <Chip>
        <En>{pos}</En>
      </Chip>
      {onPlay && (
        <Button
          variant="ghost"
          iconOnly
          aria-label={he.ds.wordCard.play}
          onClick={onPlay}
          icon={<IconSpeaker />}
        />
      )}
    </div>
  );
}

function Meaning({ meaning, example }: Pick<WordCardProps, "meaning" | "example">) {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-display-he text-2xl leading-snug font-bold break-words">{meaning}</p>
      {example && (
        <p className="text-ink-2">
          <span className="sr-only">{he.ds.wordCard.example}: </span>
          <En className="block font-en-serif text-lg break-words">{example}</En>
        </p>
      )}
    </div>
  );
}

function Face({
  hidden,
  back = false,
  children,
}: {
  hidden: boolean;
  back?: boolean;
  children: ReactNode;
}) {
  return (
    <Card
      data-face={back ? "back" : "front"}
      aria-hidden={hidden || undefined}
      inert={hidden}
      className={cx(
        "flex min-w-0 flex-col gap-6 backface-hidden [grid-area:1/1]",
        back && "rotate-y-180 motion-reduce:transform-none",
        // Reduced motion: faces are not rotated, so the hidden one fades out instead.
        "transition-opacity duration-(--duration-fast) ease-out",
        hidden && "motion-reduce:opacity-0",
      )}
    >
      {children}
    </Card>
  );
}

/** Headword in serif, POS chip, audio button, Hebrew meaning and example (docs/DESIGN.md). */
export function WordCard({
  headword,
  pos,
  meaning,
  example,
  onPlay,
  revealed,
  className,
}: WordCardProps) {
  if (revealed === undefined) {
    return (
      <Card className={cx("flex flex-col gap-6", className)}>
        <TopRow pos={pos} onPlay={onPlay} />
        <Headword headword={headword} />
        <Meaning meaning={meaning} example={example} />
      </Card>
    );
  }

  return (
    <div className={cx("perspective-[75rem]", className)}>
      <div
        data-flip={revealed ? "back" : "front"}
        className={cx(
          // minmax(0,1fr) + min-w-0 faces: long headwords wrap instead of widening the card.
          "grid grid-cols-1 transform-3d",
          "transition-transform duration-(--duration-flip) ease-spring motion-reduce:transform-none",
          revealed && "rotate-y-180",
        )}
      >
        <Face hidden={revealed}>
          <TopRow pos={pos} onPlay={onPlay} />
          <div className="flex flex-1 items-center justify-center py-6 text-center">
            <Headword headword={headword} />
          </div>
        </Face>
        <Face hidden={!revealed} back>
          <TopRow pos={pos} onPlay={onPlay} />
          <Headword headword={headword} small />
          <Meaning meaning={meaning} example={example} />
        </Face>
      </div>
    </div>
  );
}
