import Link from "next/link";
import { focusRing, joinClasses, navLink } from "@/components/calendar/styles";
import { toRunRow, type StoredRun } from "@/lib/runs";
import { runPanel } from "./styles";

type LinkedRunsProps = {
  runs: readonly StoredRun[];
};

/**
 * What actually happened on this session.
 *
 * Its presence IS the session's completion: a session is done if and only if a
 * run is linked to it. So there is no empty state here -- a session with no run
 * renders no panel at all and offers Log run instead -- and no "Log another
 * run" button, because logging always starts from the session that is waiting
 * for one.
 *
 * Usually one run. More than one is legitimate -- the form warns about a second
 * and the athlete confirms -- so each is listed with its own Edit run link
 * rather than only the first.
 *
 * Each run's pace line comes from its own snapshots, so a session read a year
 * later still shows what each run was measured against on its own day.
 *
 * Editing the run is the only thing offered from here, and it is also the only
 * way to change what the session says: there is nothing to tick, and deleting
 * the run is what un-does the day, on the run's own page.
 */
export function LinkedRuns({ runs }: LinkedRunsProps) {
  if (runs.length === 0) return null;

  return (
    <section className={runPanel} aria-labelledby="linked-runs">
      <h2 id="linked-runs" className="text-heading-sm">
        What happened
      </h2>

      <ul className="flex flex-col gap-stack-sm">
        {runs.map((run) => {
          const row = toRunRow(run);

          return (
            <li key={row.id} className="flex flex-col gap-stack-sm">
              <div className="flex flex-col gap-stack-sm">
                <span className="flex flex-wrap items-baseline gap-inline-md">
                  <span className="font-strong text-body">{row.distanceLabel}</span>
                  <span className="text-body">{row.timeLabel}</span>
                  <span className="text-body text-secondary">{row.paceLabel}</span>
                  {row.rpeLabel ? (
                    <span className="text-small text-secondary">{row.rpeLabel}</span>
                  ) : null}
                </span>

                {row.zoneLine ? (
                  <span className="text-small text-secondary">{row.zoneLine}</span>
                ) : null}

                {row.hrLabel ? (
                  <span className="text-small text-secondary">
                    {row.hrLabel} ({row.hrSourceLabel})
                  </span>
                ) : null}

                {row.notesExcerpt ? (
                  <span className="text-small text-primary">{row.notesExcerpt}</span>
                ) : null}
              </div>

              {/*
                A link per run rather than one for the section: with two runs
                logged, "Edit run" has to say which one it opens, and the run's
                own distance and time above it are what say so.
              */}
              <Link
                href={row.href}
                className={joinClasses(
                  "inline-flex min-h-touch items-center self-start",
                  navLink,
                  focusRing,
                )}
              >
                Edit run
                <span className="sr-only">
                  {" "}
                  — {row.distanceLabel} on {row.dateLabel}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
