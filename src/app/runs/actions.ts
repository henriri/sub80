"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import {
  countRunsForWorkout,
  deleteRunRow,
  logRunRow,
  readRunDetail,
  updateRunRow,
} from "@/lib/data/activities";
import { MAX_NOTES_LENGTH, parisDate } from "@/lib/plan";
import {
  RUN_WARNING_CODES,
  refusesStatsEdit,
  resetsLinkedSession,
  runLoggedMessage,
  runRejectMessage,
  runUpdatedMessage,
  statsLockedMessage,
  toStoredStats,
  validateRun,
  type RawRun,
  type RunWarning,
} from "@/lib/runs";

/**
 * The three things the athlete can do to a logged run.
 *
 * Every one follows the shape the plan actions established: the form data is
 * parsed with a schema before anything else, `requireUser` runs so an expired
 * session is a redirect to the login page rather than a vague failure, the
 * pure rule is re-run here against freshly read facts -- never against
 * anything the client decided -- and only then does the database function run,
 * which re-checks the invariants inside one transaction. A refusal comes back
 * as a message; nothing throws at the client.
 *
 * What these deliberately do NOT have is an `eventId` or an undo sentence. A
 * run is a fact, not a plan change: the functions write no `plan_events` row
 * and there is nothing to reverse, so borrowing `ChangeResult` would promise
 * an undo that does not exist.
 *
 * `needs_confirmation` is the same three-way result `moveWorkout` returns. The
 * form opens a dialog before submitting, so it normally answers the warning
 * itself; this is the authoritative backstop, and it is also what a submit
 * without JavaScript gets back, with the warnings to show.
 */

export type RunResult =
  | {
      status: "ok";
      runId: string;
      message: string;
      /**
       * New for every result, so the interface can tell a fresh answer from
       * the one already on screen -- including two identical refusals in a
       * row, which are two separate things the athlete did.
       */
      token: string;
    }
  | { status: "needs_confirmation"; warnings: readonly RunWarning[]; token: string }
  | { status: "error"; message: string; token: string };

function failed(message: string): RunResult {
  return { status: "error", message, token: crypto.randomUUID() };
}

/** A refusal the athlete cannot act on, so it says what is true instead. */
const GONE = "That run is no longer there.";

const runId = z.uuid();

/**
 * The form's fields as strings. Generous caps only, so an absurd body is not
 * parsed at all: what the values MEAN is `validateRun`'s question, and it
 * gives a better sentence than a schema would.
 */
const rawRunSchema = z.object({
  date: z.string().max(10),
  time: z.string().max(5),
  distanceKm: z.string().max(20),
  duration: z.string().max(20),
  avgHr: z.string().max(10),
  hrSource: z.string().max(20),
  rpe: z.string().max(5),
  notes: z.string().max(MAX_NOTES_LENGTH * 10),
  // '' is "no session", which is not the same as a malformed id.
  plannedWorkoutId: z
    .union([z.literal(""), z.uuid()])
    .transform((value) => (value === "" ? null : value)),
  // A closed set, so a client cannot invent a code to silence a warning.
  confirmed: z.array(z.enum(RUN_WARNING_CODES)).default([]),
});

function readForm(formData: FormData) {
  return rawRunSchema.safeParse({
    date: formData.get("date") ?? "",
    time: formData.get("time") ?? "",
    distanceKm: formData.get("distanceKm") ?? "",
    duration: formData.get("duration") ?? "",
    avgHr: formData.get("avgHr") ?? "",
    hrSource: formData.get("hrSource") ?? "",
    rpe: formData.get("rpe") ?? "",
    notes: formData.get("notes") ?? "",
    plannedWorkoutId: formData.get("plannedWorkoutId") ?? "",
    confirmed: formData.getAll("confirmed"),
  });
}

/**
 * Both pages that can show this run, plus every session it touched.
 *
 * An edit can touch two sessions -- the one it left and the one it joined --
 * so the workouts are a list rather than a single id, and a null in it is
 * simply "there was no session on that side".
 */
function revalidate(
  runIdentifier: string | null,
  workouts: readonly (string | null)[],
): void {
  revalidatePath("/runs");
  if (runIdentifier !== null) revalidatePath(`/runs/${runIdentifier}`);
  // A linked run changes a session's status, which the calendar renders.
  for (const workoutId of new Set(workouts)) {
    if (workoutId !== null) revalidatePath(`/workouts/${workoutId}`);
  }
  revalidatePath("/");
}

/**
 * Validates one submitted run against facts read here and now.
 *
 * `exceptRunId` is the run being edited, which is not "another run on this
 * session": without it, editing a linked run would always warn about itself.
 */
async function check(raw: RawRun, exceptRunId?: string) {
  const linkedRuns =
    raw.plannedWorkoutId === null
      ? 0
      : await countRunsForWorkout(raw.plannedWorkoutId, exceptRunId);

  return validateRun({ raw, today: parisDate(new Date()), linkedRuns });
}

export async function logRun(
  _previous: RunResult | null,
  formData: FormData,
): Promise<RunResult> {
  const parsed = readForm(formData);
  if (!parsed.success) return failed("That run did not make sense.");

  const { confirmed, ...raw } = parsed.data;
  await requireUser();

  try {
    const result = await check(raw);
    if (!result.ok) return failed(runRejectMessage(result.reason));

    const unconfirmed = result.warnings.filter(
      (warning) => !confirmed.includes(warning.code),
    );
    if (unconfirmed.length > 0) {
      return {
        status: "needs_confirmation",
        warnings: unconfirmed,
        token: crypto.randomUUID(),
      };
    }

    const outcome = await logRunRow(result.run);
    if (!outcome.ok) return failed(outcome.message);

    revalidate(outcome.id, [result.run.plannedWorkoutId]);
    return {
      status: "ok",
      runId: outcome.id,
      message: runLoggedMessage(result.run.date, result.run.distanceM),
      token: crypto.randomUUID(),
    };
  } catch {
    return failed("Could not log the run. Try again.");
  }
}

export async function editRun(
  _previous: RunResult | null,
  formData: FormData,
): Promise<RunResult> {
  const id = runId.safeParse(formData.get("runId"));
  const parsed = readForm(formData);
  if (!id.success || !parsed.success) return failed("That change did not make sense.");

  const { confirmed, ...raw } = parsed.data;
  await requireUser();

  try {
    // Read first, so a run that has gone gets a sentence rather than a
    // not-found from the function, and so the session it is leaving can be
    // revalidated alongside the one it is joining.
    const existing = await readRunDetail(id.data);
    if (existing === null) return failed(GONE);

    const result = await check(raw, id.data);
    if (!result.ok) return failed(runRejectMessage(result.reason));

    /*
     * An imported run's measurements are the device's record of what happened.
     * Refused here, against the row just read, by the same function the form
     * renders those fields read-only with -- and `update_run` checks it again
     * inside the transaction, so this is the sentence rather than the guarantee.
     *
     * Field by field, not a flat refusal: the form re-sends everything on every
     * submit, so changing only the note posts the distance back unchanged and
     * has to succeed.
     */
    if (refusesStatsEdit(existing.source, result.run, toStoredStats(existing))) {
      return failed(statsLockedMessage(existing.source));
    }

    const unconfirmed = result.warnings.filter(
      (warning) => !confirmed.includes(warning.code),
    );
    if (unconfirmed.length > 0) {
      return {
        status: "needs_confirmation",
        warnings: unconfirmed,
        token: crypto.randomUUID(),
      };
    }

    const outcome = await updateRunRow(id.data, result.run);
    if (!outcome.ok) return failed(outcome.message);

    revalidate(id.data, [result.run.plannedWorkoutId, existing.planned_workout_id]);
    return {
      status: "ok",
      runId: id.data,
      message: runUpdatedMessage(result.run.date, result.run.distanceM),
      token: crypto.randomUUID(),
    };
  } catch {
    return failed("Could not save the run. Try again.");
  }
}

/**
 * Only the run. Whether the session goes back to planned is NOT submitted:
 * a session is completed if and only if a run is linked to it, so the answer
 * follows from facts read here and there is nothing for a form to say about it.
 */
const removeSchema = z.object({ runId });

export async function removeRun(
  _previous: RunResult | null,
  formData: FormData,
): Promise<RunResult> {
  const parsed = removeSchema.safeParse({ runId: formData.get("runId") });
  if (!parsed.success) return failed("That deletion did not make sense.");

  const { runId: id } = parsed.data;
  await requireUser();

  try {
    // Read before deleting, so the session it was linked to can be
    // revalidated afterwards: once the row is gone there is nothing to read it
    // from.
    const existing = await readRunDetail(id);
    if (existing === null) return failed(GONE);

    /*
     * Deleting the only run on a session puts that session back to planned,
     * because a session with no run against it is not done. Decided here,
     * against rows read now, by the same function the dialog words its sentence
     * with -- and `delete_run` RAISES on a reset it cannot honour, so the two
     * have to agree.
     */
    const otherRuns =
      existing.planned_workout_id === null
        ? 0
        : await countRunsForWorkout(existing.planned_workout_id, id);
    const resetWorkout = resetsLinkedSession({
      linked: existing.planned_workout_id !== null,
      otherRuns,
    });

    const outcome = await deleteRunRow(id, resetWorkout);
    if (!outcome.ok) return failed(outcome.message);

    revalidate(null, [existing.planned_workout_id]);
  } catch {
    return failed("Could not delete the run. Try again.");
  }

  /*
   * OUTSIDE the try, deliberately. redirect() works by throwing, and the catch
   * above would turn that throw into "Could not delete the run" after the run
   * had in fact been deleted.
   *
   * The run's own page is what the athlete is standing on, and it does not
   * exist any more, so the list is the only honest place to land. The list
   * no longer containing the run is the confirmation; a session that was put
   * back shows its restored status on the calendar and on its own page.
   */
  redirect("/runs");
}
