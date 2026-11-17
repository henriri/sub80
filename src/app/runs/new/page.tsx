import Link from "next/link";
import { Suspense } from "react";
import { navLink } from "@/components/calendar/styles";
import { RunForm } from "@/components/runs/RunForm";
import { requireUser } from "@/lib/auth/require-user";
import { isValidYmd } from "@/lib/calendar";
import {
  readLinkableWorkout,
  readLinkableWorkouts,
} from "@/lib/data/activities";
import { readVdot } from "@/lib/data/planned-workouts";
import { parisDate } from "@/lib/plan";
import { parseKm, type RawRun } from "@/lib/runs";
import { logRun } from "../actions";

/**
 * What the form starts with.
 *
 * `date`, `workout` and `distance` may arrive from the "Log this run" button on
 * a session, so the athlete does not retype what the plan already knows. Each
 * is checked rather than trusted: a hand-edited URL falls back to a sensible
 * default instead of putting nonsense in a field.
 *
 * The distance is offered as the session's TARGET, not as a measurement. It is
 * a starting point to correct, which is why it is prefilled rather than fixed.
 */
function initialDraft(
  raw: Record<string, string | string[] | undefined>,
  today: string,
): RawRun {
  const one = (key: string) => {
    const value = raw[key];
    return typeof value === "string" ? value : "";
  };

  const date = one("date");
  const distance = one("distance");
  const workout = one("workout");

  return {
    date: isValidYmd(date) && date <= today ? date : today,
    time: "",
    // Re-parsed and re-printed, so '7.5' and '7,5' both arrive as a number the
    // field can show and nothing else can.
    distanceKm: parseKm(distance) === null ? "" : String(parseKm(distance)),
    duration: "",
    avgHr: "",
    hrSource: "",
    rpe: "",
    notes: "",
    plannedWorkoutId: /^[0-9a-f-]{36}$/.test(workout) ? workout : null,
  };
}

async function NewRunSection({
  searchParams,
}: {
  searchParams: PageProps<"/runs/new">["searchParams"];
}) {
  const [raw, user] = await Promise.all([searchParams, requireUser()]);
  const today = parisDate(new Date());
  const initial = initialDraft(raw, today);

  /*
   * Two entries into one form.
   *
   * From a session -- Log run on its own page -- the session is already chosen,
   * so it is read by id and shown as a line rather than offered as a picker.
   * Read by id and not out of the date window, because the session the athlete
   * pressed must be the one the form logs against however far its day is from
   * the date in the field.
   *
   * From the calendar header or /runs there is no session yet, so the wide
   * window is read instead and the form narrows it to three days either side of
   * whatever date is chosen -- which is what lets the date be moved without
   * another round trip.
   *
   * A hand-edited id that resolves to nothing falls back to the picker rather
   * than to an error: there is still a run to log.
   */
  const locked =
    initial.plannedWorkoutId === null
      ? null
      : await readLinkableWorkout(initial.plannedWorkoutId);

  const [vdot, workouts] = await Promise.all([
    readVdot(user.id),
    locked === null ? readLinkableWorkouts(user.id, initial.date) : [],
  ]);

  return (
    <>
      <div>
        <Link href="/runs" className={navLink}>
          <span aria-hidden="true">←</span> All runs
        </Link>
      </div>

      <h1 className="text-heading-md">Log a run</h1>

      <RunForm
        runId={null}
        initial={{ ...initial, plannedWorkoutId: locked?.id ?? null }}
        workouts={workouts}
        lockedSession={locked}
        today={today}
        vdot={vdot}
        action={logRun}
        submitLabel="Log this run"
      />
    </>
  );
}

/**
 * Entering a run by hand.
 *
 * Reads the URL and the session, so it sits inside a Suspense boundary, as the
 * calendar does: with Cache Components on, `searchParams` is a request-time
 * API and `requireUser` opts into request time before touching cookies.
 */
export default function NewRunPage(props: PageProps<"/runs/new">) {
  return (
    <main className="flex flex-col gap-stack-md p-inset-sm md:p-inset-lg">
      <Suspense fallback={<p className="text-small text-secondary">sub80</p>}>
        <NewRunSection searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
