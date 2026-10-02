import { interpolate } from "@/i18n/format";
import { he } from "@/i18n/he";
import { cx } from "@/lib/cx";
import { Card } from "./Card";
import { Chip } from "./Chip";
import { IconAlert, IconCalendar, IconCheck } from "./icons";

export type ExamCountdownProps = {
  /** Whole local days until the exam (0 = today, negative = past); null = no exam date set. */
  daysLeft: number | null;
  /** On-track status from the engine; not shown without an exam date or once the exam passed. */
  status?: "on-track" | "needs-more" | null;
  className?: string;
};

const t = he.ds.examCountdown;

function Headline({ daysLeft }: { daysLeft: number | null }) {
  if (daysLeft === null) return <>{t.noDate}</>;
  if (daysLeft < 0) return <>{t.past}</>;
  if (daysLeft === 0) return <>{t.today}</>;
  if (daysLeft === 1) return <>{t.tomorrow}</>;
  if (daysLeft === 2) return <>{t.twoDays}</>;
  return (
    <>
      {interpolate(t.days, {
        count: (
          <span key="n" className="text-4xl font-bold tabular-nums">
            {daysLeft}
          </span>
        ),
      })}
    </>
  );
}

export function ExamCountdown({ daysLeft, status = null, className }: ExamCountdownProps) {
  const showStatus = status !== null && daysLeft !== null && daysLeft >= 0;
  return (
    <Card flat className={cx("flex flex-col gap-3", className)} data-days-left={daysLeft ?? "none"}>
      <span className="flex items-center gap-2 text-sm font-medium text-ink-2">
        <IconCalendar />
        {t.title}
      </span>
      <p className="text-xl leading-snug font-medium">
        <Headline daysLeft={daysLeft} />
      </p>
      {showStatus &&
        (status === "on-track" ? (
          <Chip tone="success" icon={<IconCheck className="size-4" />} className="self-start">
            {t.onTrack}
          </Chip>
        ) : (
          <Chip tone="danger" icon={<IconAlert className="size-4" />} className="self-start">
            {t.needsMore}
          </Chip>
        ))}
    </Card>
  );
}
