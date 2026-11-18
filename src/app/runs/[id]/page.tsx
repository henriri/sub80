import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { navLink, panel } from "@/components/calendar/styles";
import { DeleteRunButton } from "@/components/runs/DeleteRunButton";
import { RunForm } from "@/components/runs/RunForm";
import { runPanel } from "@/components/runs/styles";
import { requireUser } from "@/lib/auth/require-user";
import {
  countRunsForWorkout,
  readLinkableWorkouts,
  readRunDetail,
} from "@/lib/data/activities";
import { readVdot } from "@/lib/data/planned-workouts";
import { parisDate } from "@/lib/plan";
import {
  resetsLinkedSession,
  toRawRun,
  toRunRow,
  type StoredRun,
} from "@/lib/runs";
import { editRun, removeRun } from "../actions";

/** One fact of the run, as a term and a value. */
type Fact = { term: string; value: string; note?: string };

/**
 * What is actually stored about this run.
 *
 * The zone line comes from the run's OWN snapshots -- `planned_pace_zone` and
 * `vdot_used` -- not from today's fitness, so a run from a year ago is read
 * against the paces it was aimed at. `toRunRow` already does that, which is
 * why the labels come from there rather than being formatted again here.
 */
function facts(run: StoredRun): Fact[] {
  const row = toRunRow(run);

  return [
    {
      term: "Day",
      value: row.fullDateLabel,
      // A run entered without a time is stored at midday Paris so that it has
      // an instant at all. That placeholder is never shown as a real time.
      note: row.startTimeLabel ?? "No start time recorded",
    },
    { term: "Distance", value: row.distanceLabel },
    { term: "Time", value: row.timeLabel },
    { term: "Pace", value: row.paceLabel, note: row.zoneLine ?? undefined },
    ...(row.rpeLabel === null ? [] : [{ term: "Effort", value: row.rpeLabel }]),
    ...(row.hrLabel === null
      ? []
      : [
          {
            term: "Heart rate",
            value: row.hrLabel,
            // Always said: a strap reading and a wrist reading are never mixed
            // or averaged, so a number without its source means little.
            note: row.hrSourceLabel ?? undefined,
          },
        ]),
    { term: "Entered", value: run.source === "manual" ? "By hand" : run.source },
  ];
}

async function RunSection({ params }: { params: PageProps<"/runs/[id]">["params"] }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);

  const run = await readRunDetail(id);
  // Row-level security already scoped the read, so a miss is either a deleted
  // row or another user's. Neither is a page.
  if (run === null) notFound();

  const initial = toRawRun(run);

  const [vdot, workouts, otherRuns] = await Promise.all([
    readVdot(user.id),
    readLinkableWorkouts(user.id, initial.date),
    // Excludes this run, so "another run" means what it says.
    run.planned_workout_id === null
      ? Promise.resolve(0)
      : countRunsForWorkout(run.planned_workout_id, run.id),
  ]);

  const row = toRunRow(run);

  return (
    <>
      <div className="flex flex-wrap gap-inline-sm">
        <Link href="/runs" className={navLink}>
          <span aria-hidden="true">←</span> All runs
        </Link>
        {row.workoutHref ? (
          <Link href={row.workoutHref} className={navLink}>
            {row.workoutTitle}
          </Link>
        ) : null}
      </div>

      <header className={`${panel} flex flex-col gap-stack-sm`}>
        <h1 className="text-heading-md">
          {row.distanceLabel} on {row.dateLabel}
        </h1>

        <dl className="flex flex-col gap-stack-sm">
          {facts(run).map((fact) => (
            <div key={fact.term} className="flex flex-wrap items-baseline gap-inline-md">
              <dt className="text-small text-secondary">{fact.term}</dt>
              <dd className="text-body">
                {fact.value}
                {fact.note ? (
                  <span className="text-small text-secondary"> · {fact.note}</span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>

        {run.notes === null ? null : (
          <div className="flex flex-col gap-stack-sm">
            <h2 className="text-small text-secondary">How it felt</h2>
            <p className="text-body whitespace-pre-line">{run.notes}</p>
          </div>
        )}
      </header>

      <section className="flex flex-col gap-stack-md" aria-labelledby="edit-run">
        <h2 id="edit-run" className="text-heading-sm">
          Edit this run
        </h2>
        <RunForm
          runId={run.id}
          initial={initial}
          workouts={workouts}
          today={parisDate(new Date())}
          vdot={vdot}
          action={editRun}
          submitLabel="Save changes"
        />
      </section>

      <section className={`${runPanel}`} aria-labelledby="delete-run">
        <h2 id="delete-run" className="text-heading-sm">
          Delete
        </h2>
        {/*
          The dialog states what the deletion will do; the Server Action asks
          the same function again against rows read at the time, so the sentence
          and the deed cannot disagree and nothing submitted decides it.
        */}
        <DeleteRunButton
          runId={run.id}
          resetsSession={resetsLinkedSession({
            linked: run.planned_workout_id !== null,
            otherRuns,
          })}
          action={removeRun}
        />
      </section>
    </>
  );
}

/**
 * One run in full: what was stored, the form to change it, and the deletion.
 *
 * Reads the session, so it sits inside a Suspense boundary: `requireUser` opts
 * into request time before touching cookies, as every other page here does.
 */
export default function RunPage(props: PageProps<"/runs/[id]">) {
  return (
    <main className="flex flex-col gap-stack-md p-inset-sm md:p-inset-lg">
      <Suspense fallback={<p className="text-small text-secondary">sub80</p>}>
        <RunSection params={props.params} />
      </Suspense>
    </main>
  );
}
