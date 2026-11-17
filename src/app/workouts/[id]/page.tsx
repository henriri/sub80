import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { LinkedRuns } from "@/components/runs/LinkedRuns";
import { focusRing, navLink, panel } from "@/components/calendar/styles";
import { WorkoutActions } from "@/components/workout/WorkoutActions";
import { WorkoutFacts } from "@/components/workout/WorkoutFacts";
import type { LightenOption } from "@/components/workout/LightenActions";
import { requireUser } from "@/lib/auth/require-user";
import { calendarHref, parseCalendarParams } from "@/lib/calendar";
import { readRunsForWorkout } from "@/lib/data/activities";
import { readVdot, readWorkoutDetail } from "@/lib/data/planned-workouts";
import {
  lightenedDistance,
  offeredFractions,
  parisDate,
  plannedDistance,
  sessionActions,
  type SessionCandidate,
  type WorkoutDetail,
} from "@/lib/plan";
import { logRunHref } from "@/lib/runs";

/**
 * What the rules need, read off the row just read.
 *
 * `WorkoutDetail` is a superset of `SessionCandidate`, so this is a narrowing
 * rather than a translation: the rules see the stored values and nothing the
 * page has decided.
 */
const candidate = (workout: WorkoutDetail): SessionCandidate => ({
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
 * Log run, in the button's own tokens.
 *
 * A link rather than a `Button`: it opens the log form on another page, and the
 * only honest control for a navigation is an anchor. The tokens are the
 * button's, so it is the same object to look at.
 */
const primaryAction = [
  "inline-flex min-h-(--button-min-height) min-w-touch items-center justify-center",
  "rounded-(--button-radius) px-(--button-padding-x) py-(--button-padding-y)",
  "bg-(--button-bg) text-(color:--button-fg) hover:bg-(--button-bg-hover)",
  "font-(family-name:--button-font-family) font-(--button-font-weight) text-body",
  focusRing,
].join(" ");

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

  const [workout, vdot, runs] = await Promise.all([
    readWorkoutDetail(id),
    readVdot(user.id),
    readRunsForWorkout(id),
  ]);

  // Row-level security already scoped the read, so a miss is either a deleted
  // row or another user's. Neither is a page.
  if (workout === null) notFound();

  /*
   * The one decision about what this session offers. Everything below renders
   * from it: the drag layer and the calendar card read the same function, so
   * the three cannot disagree about whether a session is finished.
   *
   * `today` is passed in rather than read in a render. A run is what makes the
   * session done, so the runs are an input here and the stored status is not
   * consulted for that question at all.
   */
  const actions = sessionActions(candidate(workout), runs, today);

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

      <LinkedRuns runs={runs} />

      {/*
        The primary action whenever the day has come and nothing is logged yet.
        It replaces both "Mark done" and the old "No run logged" block: there is
        one way to finish a session, and it is to say what actually happened.
      */}
      {actions.canLogRun ? (
        <div>
          <Link href={logRunHref(workout)} className={primaryAction}>
            Log run
          </Link>
        </div>
      ) : null}

      <WorkoutActions
        workoutId={workout.id}
        actions={actions}
        lighten={lightenOptions(workout)}
        restoreToM={workout.original_distance_m}
      />
    </>
  );
}

/**
 * One planned session in full: what it asks for, what its pace zone means at
 * today's fitness, what happened on it, and the changes still open to it.
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
