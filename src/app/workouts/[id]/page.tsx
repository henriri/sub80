import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { RecentChanges } from "@/components/calendar/RecentChanges";
import { LinkedRuns } from "@/components/runs/LinkedRuns";
import { navLink, panel } from "@/components/calendar/styles";
import { WorkoutActions } from "@/components/workout/WorkoutActions";
import { WorkoutFacts } from "@/components/workout/WorkoutFacts";
import type { LightenOption } from "@/components/workout/LightenActions";
import { requireUser } from "@/lib/auth/require-user";
import {
  calendarHref,
  lightenRejectMessage,
  parseCalendarParams,
  undoableIndex,
} from "@/lib/calendar";
import { readRunsForWorkout } from "@/lib/data/activities";
import { readRecentPlanEvents } from "@/lib/data/plan-events";
import { readVdot, readWorkoutDetail } from "@/lib/data/planned-workouts";
import {
  LIGHTEN_FRACTIONS,
  lightenedDistance,
  offeredFractions,
  parisDate,
  plannedDistance,
  validateLighten,
  type WorkoutDetail,
} from "@/lib/plan";

/** How much history the detail page shows. The calendar shows ten. */
const RECENT_CHANGES = 5;

/** What the lighter-day rules need, read off the row just read. */
const candidate = (workout: WorkoutDetail) => ({
  id: workout.id,
  status: workout.status,
  planned_date: workout.planned_date,
  target_distance_m: workout.target_distance_m,
  original_distance_m: workout.original_distance_m,
});

/**
 * The reductions worth offering, each with the distance it would store.
 *
 * `offeredFractions` is the rule; the distances come from the same
 * `lightenedDistance` the Server Action computes with, so the number on the
 * button is the number that will be saved.
 */
function lightenOptions(workout: WorkoutDetail): LightenOption[] {
  const base = plannedDistance(candidate(workout));
  if (base === null) return [];

  return offeredFractions(candidate(workout)).map((by) => ({
    by,
    toM: lightenedDistance(base, by),
  }));
}

/**
 * Why the lighter actions are not offered at all, or null when they are.
 *
 * Asked of `validateLighten` rather than decided here, so the interface and
 * the server cannot disagree. The two fractions are both tried: a day that
 * refuses one only because it is already lighter than that still has the
 * other, and that is a case for `LightenActions` to explain, not for
 * withholding the whole section.
 */
function lightenWithheld(workout: WorkoutDetail, today: string): string | null {
  const checks = LIGHTEN_FRACTIONS.map((by) =>
    validateLighten({ workout: candidate(workout), by, today }),
  );
  if (checks.some((check) => check.ok)) return null;

  // Nothing can be taken off. A day already at its floor, or lightened as far
  // as it goes, keeps its restore button; a past or finished session does not.
  const blocking = checks.find(
    (check) => !check.ok && check.reason.code !== "would_raise",
  );
  return blocking?.ok === false ? lightenRejectMessage(blocking.reason) : null;
}

async function WorkoutSection({
  params,
  searchParams,
}: {
  params: PageProps<"/workouts/[id]">["params"];
  searchParams: PageProps<"/workouts/[id]">["searchParams"];
}) {
  const [{ id }, raw, user] = await Promise.all([params, searchParams, requireUser()]);
  const today = parisDate(new Date());

  // The view and date the athlete came from, so the back link returns there.
  // A hand-edited pair is a redirect to this page with the default, exactly as
  // the calendar redirects rather than rendering half a view.
  const parsed = parseCalendarParams(raw, today);
  if (!parsed.ok) {
    redirect(`/workouts/${id}?view=${parsed.fallback.view}&date=${parsed.fallback.date}`);
  }

  const [workout, vdot, events, runs] = await Promise.all([
    readWorkoutDetail(id),
    readVdot(user.id),
    readRecentPlanEvents(user.id, RECENT_CHANGES),
    readRunsForWorkout(id),
  ]);

  // Row-level security already scoped the read, so a miss is either a deleted
  // row or another user's. Neither is a page.
  if (workout === null) notFound();

  const undoable = undoableIndex(events);
  const changes = events.map((event, index) => ({
    id: event.id,
    kind: event.kind,
    status: event.status,
    move: event.move,
    before: event.before,
    after: event.after,
    undoneKind: event.undoneKind,
    undoable: index === undoable,
  }));

  return (
    <>
      <div>
        <Link href={calendarHref(parsed.params)} className={navLink}>
          <span aria-hidden="true">←</span> Back to the calendar
        </Link>
      </div>

      <header className={`${panel} flex flex-col gap-stack-sm`}>
        <h1 className="text-heading-md">{workout.title}</h1>
        <WorkoutFacts workout={workout} vdot={vdot} />
      </header>

      <LinkedRuns
        workout={{
          id: workout.id,
          planned_date: workout.planned_date,
          target_distance_m: workout.target_distance_m,
        }}
        runs={runs}
      />

      <WorkoutActions
        workoutId={workout.id}
        status={workout.status}
        notes={workout.notes}
        lighten={lightenOptions(workout)}
        restoreToM={workout.original_distance_m}
        lightenWithheld={lightenWithheld(workout, today)}
      />

      <RecentChanges changes={changes} />
    </>
  );
}

/**
 * One planned session in full: what it asks for, what its pace zone means at
 * today's fitness, and the four things the athlete can change about it.
 *
 * Reads the URL and the session, so it sits inside a Suspense boundary, as the
 * calendar does: with Cache Components on, `searchParams` is a request-time
 * API and `requireUser` opts into request time before touching cookies.
 */
export default function WorkoutPage(props: PageProps<"/workouts/[id]">) {
  return (
    <main className="flex flex-col gap-stack-md p-inset-sm md:p-inset-lg">
      <Suspense fallback={<p className="text-small text-secondary">sub80</p>}>
        <WorkoutSection params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
