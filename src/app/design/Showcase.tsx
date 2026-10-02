"use client";

import { type ReactNode, useId, useState } from "react";
import { AnswerInput } from "@/components/ds/AnswerInput";
import { Button, type ButtonVariant } from "@/components/ds/Button";
import { Card } from "@/components/ds/Card";
import { Chip } from "@/components/ds/Chip";
import { ChoiceList } from "@/components/ds/ChoiceList";
import { EmptyState } from "@/components/ds/EmptyState";
import { En } from "@/components/ds/En";
import { ExamCountdown } from "@/components/ds/ExamCountdown";
import * as Icons from "@/components/ds/icons";
import { MasteryRing } from "@/components/ds/MasteryRing";
import { ProgressBar } from "@/components/ds/ProgressBar";
import { Sheet } from "@/components/ds/Sheet";
import { Stat } from "@/components/ds/Stat";
import { Toast, ToastProvider, useToast } from "@/components/ds/Toast";
import { WordCard } from "@/components/ds/WordCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { format, interpolate } from "@/i18n/format";
import { he } from "@/i18n/he";
import { cx } from "@/lib/cx";
import {
  mixedSentenceWords,
  sampleWords,
  serifCandidates,
  serifSampleWords,
  tokenSwatches,
} from "./fixtures";

const s = he.design.samples;
const st = he.design.states;

type DemoState = "default" | "hover" | "focus" | "active" | "disabled" | "loading" | "error";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="flex min-w-0 flex-col gap-4 border-t border-line pt-6"
    >
      <h2 id={`${id}-title`} className="font-display-he text-2xl font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** One labelled example. `demo` forces a hover/active/focus look via the ui-* variants. */
function Example({
  label,
  demo,
  className,
  children,
}: {
  label: string;
  demo?: "hover" | "active" | "focus";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-2", className)}>
      <span className="text-sm text-ink-2">{label}</span>
      {/* Forced-state copies are inert: only the real control is reachable by keyboard. */}
      <div data-demo={demo} inert={demo !== undefined}>
        {children}
      </div>
    </div>
  );
}

const BUTTON_VARIANTS: ButtonVariant[] = ["primary", "secondary", "ghost", "danger"];
const BUTTON_STATES: DemoState[] = ["default", "hover", "focus", "active", "disabled", "loading"];
const BUTTON_LABEL: Record<ButtonVariant, string> = {
  primary: s.primary,
  secondary: s.secondary,
  ghost: s.ghost,
  danger: s.danger,
};

function demoOf(state: DemoState) {
  return state === "hover" || state === "active" || state === "focus" ? state : undefined;
}

function ButtonsSection() {
  return (
    <Section id="button" title={he.design.sections.button}>
      {BUTTON_VARIANTS.map((variant) => (
        <div key={variant} className="flex flex-wrap gap-4" data-variant-row={variant}>
          {BUTTON_STATES.map((state) => (
            <Example key={state} label={st[state as keyof typeof st]} demo={demoOf(state)}>
              <Button
                variant={variant}
                disabled={state === "disabled"}
                loading={state === "loading"}
              >
                {BUTTON_LABEL[variant]}
              </Button>
            </Example>
          ))}
        </div>
      ))}
      <div className="flex flex-wrap gap-4">
        <Example label={s.withIcon}>
          <Button icon={<Icons.IconArrowNext />}>{s.primary}</Button>
        </Example>
        <Example label={he.ds.wordCard.play}>
          <Button
            variant="secondary"
            iconOnly
            aria-label={he.ds.wordCard.play}
            icon={<Icons.IconSpeaker />}
          />
        </Example>
      </div>
    </Section>
  );
}

function ChipsSection() {
  const [minutes, setMinutes] = useState(10);
  return (
    <Section id="chip" title={he.design.sections.chip}>
      <div className="flex flex-wrap gap-2">
        <Chip>{s.chipNeutral}</Chip>
        <Chip tone="accent">{s.chipAccent}</Chip>
        <Chip tone="success" icon={<Icons.IconCheck className="size-4" />}>
          {s.chipSuccess}
        </Chip>
        <Chip tone="danger" icon={<Icons.IconAlert className="size-4" />}>
          {s.chipDanger}
        </Chip>
        <Chip>
          <En>verb</En>
        </Chip>
      </div>
      <Example label={s.interactive}>
        <div className="flex flex-wrap gap-2">
          {[5, 10, 20].map((m) => (
            <Chip key={m} pressed={minutes === m} onPressedChange={() => setMinutes(m)}>
              {format(s.minutes, { count: m })}
            </Chip>
          ))}
        </div>
      </Example>
      <div className="flex flex-wrap gap-4">
        {(["hover", "focus", "active"] as const).map((demo) => (
          <Example key={demo} label={st[demo]} demo={demo}>
            <Chip pressed={false} onPressedChange={() => {}}>
              {format(s.minutes, { count: 5 })}
            </Chip>
          </Example>
        ))}
        <Example label={st.selected}>
          <Chip pressed onPressedChange={() => {}}>
            {format(s.minutes, { count: 10 })}
          </Chip>
        </Example>
        <Example label={st.disabled}>
          <Chip pressed={false} disabled onPressedChange={() => {}}>
            {format(s.minutes, { count: 20 })}
          </Chip>
        </Example>
      </div>
    </Section>
  );
}

function WordCardSection() {
  const [revealed, setRevealed] = useState(false);
  const w = sampleWords.ignore;
  const noop = () => {};
  return (
    <Section id="word-card" title={he.design.sections.wordCard}>
      <Example label={st.default}>
        <WordCard {...w} meaning={s.wordMeaning} onPlay={noop} />
      </Example>
      <Example label={s.interactive}>
        <div className="flex flex-col gap-3" data-testid="flip-card">
          <WordCard
            {...sampleWords.resilient}
            meaning={s.wordMeaningAlt}
            onPlay={noop}
            revealed={revealed}
          />
          <Button variant="secondary" onClick={() => setRevealed((r) => !r)} className="self-start">
            {s.flip}
          </Button>
        </div>
      </Example>
      <Example label={s.revealed}>
        <WordCard {...w} meaning={s.wordMeaning} onPlay={noop} revealed />
      </Example>
      <Example label={s.noAudio}>
        <WordCard {...sampleWords.long} meaning={s.longMeaning} />
      </Example>
      <Example label={s.longFlip}>
        <div data-testid="flip-long">
          <WordCard {...sampleWords.long} meaning={s.longMeaning} revealed={false} />
        </div>
      </Example>
    </Section>
  );
}

function ChoiceListSection() {
  const [round, setRound] = useState(0);
  const questionId = useId();
  const options = [
    { id: "a", label: s.choiceA },
    { id: "b", label: s.choiceB },
    { id: "c", label: s.choiceC },
    { id: "d", label: s.choiceD },
  ];
  const question = (
    <p id={questionId} className="text-lg">
      {s.choiceQuestion}{" "}
      <En className="font-en-serif text-2xl font-medium">{sampleWords.ignore.headword}</En>
    </p>
  );
  return (
    <Section id="choice-list" title={he.design.sections.choiceList}>
      <Example label={s.interactive}>
        <div className="flex flex-col gap-3" data-testid="choice-interactive">
          {question}
          <ChoiceList key={round} options={options} correctId="a" labelledBy={questionId} />
          <Button variant="ghost" onClick={() => setRound((r) => r + 1)} className="self-start">
            {s.reset}
          </Button>
        </div>
      </Example>
      <Example label={`${s.answered}: ${he.ds.choiceList.correct}`}>
        <ChoiceList
          options={options}
          correctId="a"
          initialAnswerId="a"
          shortcuts={false}
          label={s.choiceQuestion}
        />
      </Example>
      <Example label={`${s.answered}: ${he.ds.choiceList.wrong}`}>
        <ChoiceList
          options={options}
          correctId="a"
          initialAnswerId="c"
          shortcuts={false}
          label={s.choiceQuestion}
        />
      </Example>
      <div className="grid gap-4 sm:grid-cols-2">
        {(["hover", "focus", "active"] as const).map((demo) => (
          <Example key={demo} label={st[demo]} demo={demo}>
            <ChoiceList
              options={options.slice(0, 1)}
              correctId="a"
              shortcuts={false}
              label={st[demo]}
            />
          </Example>
        ))}
        <Example label={st.disabled}>
          <ChoiceList
            options={options.slice(0, 2)}
            correctId="a"
            shortcuts={false}
            disabled
            label={st.disabled}
          />
        </Example>
      </div>
    </Section>
  );
}

function AnswerInputSection() {
  const toast = useToast();
  return (
    <Section id="answer-input" title={he.design.sections.answerInput}>
      <Example label={s.interactive}>
        <AnswerInput
          onSubmit={() => toast({ tone: "success", message: s.submitted })}
          onDontKnow={() => toast({ tone: "info", message: s.submitted })}
        />
      </Example>
      <Example label={st.focus} demo="focus">
        <AnswerInput onSubmit={() => {}} defaultValue="ignor" />
      </Example>
      <Example label={st.error}>
        <AnswerInput onSubmit={() => {}} error={he.ds.answerInput.empty} onDontKnow={() => {}} />
      </Example>
      <Example label={st.loading}>
        <AnswerInput onSubmit={() => {}} defaultValue="ignore" loading />
      </Example>
      <Example label={st.disabled}>
        <AnswerInput onSubmit={() => {}} disabled onDontKnow={() => {}} />
      </Example>
    </Section>
  );
}

function SheetSection() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<"translation" | "example">("translation");
  return (
    <Section id="sheet" title={he.design.sections.sheet}>
      <Button variant="secondary" onClick={() => setOpen(true)} className="self-start">
        {s.openSheet}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={s.sheetTitle}>
        <p className="text-ink-2">{s.sheetBody}</p>
        <div className="flex flex-wrap gap-2">
          <Chip pressed={reason === "translation"} onPressedChange={() => setReason("translation")}>
            {s.sheetReasonTranslation}
          </Chip>
          <Chip pressed={reason === "example"} onPressedChange={() => setReason("example")}>
            {s.sheetReasonExample}
          </Chip>
        </div>
        <Button fullWidth onClick={() => setOpen(false)}>
          {s.sheetSend}
        </Button>
      </Sheet>
    </Section>
  );
}

function ToastSection() {
  const toast = useToast();
  return (
    <Section id="toast" title={he.design.sections.toast}>
      <div className="flex flex-col gap-3">
        <Toast tone="info" message={s.toastInfo} onDismiss={() => {}} />
        <Toast tone="success" message={s.toastSuccess} onDismiss={() => {}} />
        <Toast tone="danger" message={s.toastDanger} />
      </div>
      <Button
        variant="secondary"
        className="self-start"
        onClick={() => toast({ tone: "success", message: s.toastSuccess })}
      >
        {s.showToast}
      </Button>
    </Section>
  );
}

const ICONS = [
  ["chevron-next", Icons.IconChevronNext],
  ["arrow-next", Icons.IconArrowNext],
  ["arrow-back", Icons.IconArrowBack],
  ["play", Icons.IconPlay],
  ["speaker", Icons.IconSpeaker],
  ["check", Icons.IconCheck],
  ["x", Icons.IconX],
  ["info", Icons.IconInfo],
  ["alert", Icons.IconAlert],
  ["calendar", Icons.IconCalendar],
  ["sparkle", Icons.IconSparkle],
  ["spinner", Icons.IconSpinner],
] as const;

function Showcase() {
  return (
    <main className="mx-auto flex w-full max-w-[35rem] flex-col gap-8 px-4 py-8 sm:px-6 lg:max-w-6xl">
      <header className="flex flex-col gap-4">
        <h1 className="font-display-he text-4xl font-black">{he.design.title}</h1>
        <p className="text-ink-2">{he.design.intro}</p>
        <ThemeToggle />
      </header>

      <div className="grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-2">
        <Section id="tokens" title={he.design.sections.tokens}>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {tokenSwatches.map((t) => (
              <li key={t.name} className="flex items-center gap-2 text-sm">
                <span
                  className={cx("size-8 shrink-0 rounded-control border border-line", t.className)}
                />
                <En className="break-all">{t.name}</En>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="typography" title={he.design.sections.typography}>
          <p className="font-display-he text-3xl font-black">{s.displayHe}</p>
          <p className="font-display-he text-2xl font-medium">{s.displayHe}</p>
          <p>{s.bodyHe}</p>
          <Stat label={s.tabular} value="0123456789" />
        </Section>

        <Section id="serif" title={he.design.sections.serif}>
          <div className="grid grid-cols-2 gap-3">
            {serifCandidates.map((c) => (
              <div key={c.name} className="flex min-w-0 flex-col gap-2" data-serif={c.name}>
                <En className="text-sm font-medium text-ink-2">{c.name}</En>
                {(["light", "dark"] as const).map((mode) => (
                  <div
                    key={mode}
                    data-theme={mode}
                    className="flex flex-col gap-1 rounded-card border border-line bg-bg p-3 text-ink"
                  >
                    <span className="text-xs text-ink-2">
                      {mode === "light" ? s.lightPanel : s.darkPanel}
                    </span>
                    {serifSampleWords.map((w) => (
                      <En
                        key={w}
                        className={cx("block text-3xl leading-tight sm:text-5xl", c.className)}
                      >
                        {w}
                      </En>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Section>

        <ButtonsSection />

        <Section id="card" title={he.design.sections.card}>
          <Card>
            <h3 className="mb-2 text-lg font-bold">{s.cardTitle}</h3>
            <p className="text-ink-2">{s.cardBody}</p>
          </Card>
          <Card flat>
            <h3 className="mb-2 text-lg font-bold">{s.cardTitle}</h3>
            <p className="text-ink-2">{s.cardBody}</p>
          </Card>
        </Section>

        <ChipsSection />

        <Section id="progress-bar" title={he.design.sections.progressBar}>
          <ProgressBar value={0} max={10} />
          <ProgressBar value={4} max={10} />
          <ProgressBar value={10} max={10} />
        </Section>

        <Section id="mastery-ring" title={he.design.sections.masteryRing}>
          <Example label={s.perSense}>
            <div className="flex flex-wrap items-center gap-4">
              <MasteryRing variant="sense" layers={{ recognition: true }}>
                1/1
              </MasteryRing>
              <MasteryRing variant="sense" layers={{ recognition: true, context: false }}>
                1/2
              </MasteryRing>
              <MasteryRing
                variant="sense"
                layers={{ recognition: false, context: false, production: false }}
              >
                0/3
              </MasteryRing>
              <MasteryRing
                variant="sense"
                layers={{ recognition: true, context: true, production: false }}
              >
                2/3
              </MasteryRing>
              <MasteryRing
                variant="sense"
                layers={{ recognition: true, context: true, production: true }}
              >
                3/3
              </MasteryRing>
            </div>
          </Example>
          <Example label={s.aggregate}>
            <div className="flex flex-wrap items-center gap-4">
              {(["sm", "md", "lg"] as const).map((size) => (
                <MasteryRing
                  key={size}
                  size={size}
                  variant="aggregate"
                  shares={{ recognition: 0.8, context: 0.55, production: 0.2 }}
                >
                  {size === "lg" ? "52%" : null}
                </MasteryRing>
              ))}
            </div>
          </Example>
        </Section>

        <WordCardSection />
        <ChoiceListSection />
        <AnswerInputSection />
        <SheetSection />
        <ToastSection />

        <Section id="exam-countdown" title={he.design.sections.examCountdown}>
          <div className="grid gap-3 sm:grid-cols-2">
            <ExamCountdown daysLeft={null} />
            <ExamCountdown daysLeft={45} status="on-track" />
            <ExamCountdown daysLeft={12} status="needs-more" />
            <ExamCountdown daysLeft={2} status="on-track" />
            <ExamCountdown daysLeft={1} status="needs-more" />
            <ExamCountdown daysLeft={0} status="on-track" />
            <ExamCountdown daysLeft={-3} status="on-track" />
          </div>
        </Section>

        <Section id="stat" title={he.design.sections.stat}>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
            <Stat label={s.statMastered} value={128} hint={format(s.statHint, { count: 14 })} />
            <Stat label={s.statStreak} value={6} />
            <Stat label={s.statDue} value={23} />
          </div>
        </Section>

        <Section id="empty-state" title={he.design.sections.emptyState}>
          <Card flat>
            <EmptyState
              icon={<Icons.IconSparkle />}
              title={s.emptyTitle}
              body={s.emptyBody}
              action={<Button icon={<Icons.IconArrowNext />}>{s.emptyAction}</Button>}
            />
          </Card>
        </Section>

        <Section id="icons" title={he.design.sections.icons}>
          <p className="text-ink-2">{s.iconsNote}</p>
          <ul className="grid grid-cols-3 gap-4 sm:grid-cols-4">
            {ICONS.map(([name, Icon]) => (
              <li key={name} className="flex flex-col items-center gap-1 text-sm text-ink-2">
                <Icon className="size-6 text-ink" />
                <En>{name}</En>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="bidi" title={he.design.sections.bidi}>
          <p data-testid="bidi-sentence" className="text-lg">
            {interpolate(s.mixedSentence, {
              word: <En key="w">{mixedSentenceWords.word}</En>,
              phrase: <En key="p">{mixedSentenceWords.phrase}</En>,
            })}
          </p>
        </Section>

        <Section id="wrap" title={he.design.sections.wrap}>
          <div data-testid="wrap-box" className="flex max-w-[20rem] flex-col gap-3">
            <p>{s.longText}</p>
            <Button fullWidth>{s.longText}</Button>
            <Chip tone="accent">{s.longMeaning}</Chip>
          </div>
        </Section>
      </div>
    </main>
  );
}

export function DesignShowcase() {
  return (
    <ToastProvider>
      <Showcase />
    </ToastProvider>
  );
}
