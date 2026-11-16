import Link from "next/link";
import { focusRing, joinClasses } from "@/components/calendar/styles";
import type { RunRow } from "@/lib/runs";
import { runPanel } from "./styles";

type RunCardProps = { run: RunRow };

/**
 * One run in the list.
 *
 * The whole card is one link to the run's own page, so the touch target is the
 * card rather than a word inside it. The linked session is named but is NOT a
 * second link: a link inside a link is invalid, and the session is one tap away
 * from the run's page anyway.
 *
 * The heart rate always says which source it came from. A number on its own
 * would invite comparing a strap reading with a wrist one, and those are never
 * mixed or averaged.
 */
export function RunCard({ run }: RunCardProps) {
  return (
    <li>
      <Link
        href={run.href}
        className={joinClasses(runPanel, "hover:bg-raised", focusRing)}
      >
        <div className="flex flex-wrap items-baseline gap-inline-md">
          <span className="font-strong text-body">{run.dateLabel}</span>
          {run.startTimeLabel ? (
            <span className="text-small text-secondary">{run.startTimeLabel}</span>
          ) : null}
          {/* The accessible name carries the full date; the chip shows 'Sat 20 Nov'. */}
          <span className="sr-only">{run.fullDateLabel}</span>
        </div>

        <div className="flex flex-wrap items-baseline gap-inline-md">
          <span className="font-strong text-body">{run.distanceLabel}</span>
          <span className="text-body">{run.timeLabel}</span>
          <span className="text-body text-secondary">{run.paceLabel}</span>
        </div>

        <dl className="flex flex-wrap gap-inline-md text-small text-secondary">
          {run.rpeLabel ? (
            <div className="flex gap-inline-sm">
              <dt>Effort</dt>
              <dd className="text-primary">{run.rpeLabel}</dd>
            </div>
          ) : null}

          {run.hrLabel ? (
            <div className="flex gap-inline-sm">
              <dt>Heart rate</dt>
              <dd className="text-primary">
                {run.hrLabel} ({run.hrSourceLabel})
              </dd>
            </div>
          ) : null}

          {run.workoutTitle ? (
            <div className="flex gap-inline-sm">
              <dt>Session</dt>
              <dd className="text-primary">{run.workoutTitle}</dd>
            </div>
          ) : null}
        </dl>

        {run.zoneLine ? (
          <p className="text-small text-secondary">{run.zoneLine}</p>
        ) : null}

        {run.notesExcerpt ? (
          <p className="text-small text-primary">{run.notesExcerpt}</p>
        ) : null}
      </Link>
    </li>
  );
}
