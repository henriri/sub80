import Link from "next/link";
import { focusRing, joinClasses, navLink } from "@/components/calendar/styles";
import { logRunHref, toRunRow, type StoredRun } from "@/lib/runs";
import { runPanel } from "./styles";

type LinkedRunsProps = {
  /** The session these runs belong to, for the "Log this run" link. */
  workout: { id: string; planned_date: string; target_distance_m: number | null };
  runs: readonly StoredRun[];
};

/**
 * What actually happened on this session, on the session's own page.
 *
 * Usually nothing or one run. More than one is legitimate -- the form warns
 * about a second and the athlete confirms -- so all of them are listed rather
 * than only the first.
 *
 * Each run's pace line comes from its own snapshots, so a session read a year
 * later still shows what each run was measured against on its own day.
 *
 * The button stays available after a run has been logged: a second run on one
 * session is a real thing, and withholding the button would make the legitimate
 * case impossible from here.
 */
export function LinkedRuns({ workout, runs }: LinkedRunsProps) {
  return (
    <section className={runPanel} aria-labelledby="linked-runs">
      <div className="flex flex-wrap items-center justify-between gap-inline-md">
        <h2 id="linked-runs" className="text-heading-sm">
          {runs.length === 0 ? "No run logged" : "What happened"}
        </h2>
        <Link href={logRunHref(workout)} className={navLink}>
          {runs.length === 0 ? "Log this run" : "Log another run"}
        </Link>
      </div>

      {runs.length === 0 ? (
        <p className="text-small text-secondary">
          Nothing recorded against this session yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-stack-sm">
          {runs.map((run) => {
            const row = toRunRow(run);

            return (
              <li key={row.id}>
                <Link
                  href={row.href}
                  className={joinClasses(
                    "flex min-h-touch flex-col justify-center gap-stack-sm",
                    "rounded-control px-inset-sm py-inset-sm hover:bg-raised",
                    focusRing,
                  )}
                >
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
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
