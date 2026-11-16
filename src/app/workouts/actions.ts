"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import {
  DAYS_IN_WEEK,
  lightenRejectMessage,
  planEventMessage,
  statusRejectMessage,
  undoneChangeMessage,
  type ChangeSnapshot,
} from "@/lib/calendar";
import {
  lightenWorkoutRow,
  readNextWorkouts,
  readWorkoutDetail,
  restoreDistanceRow,
  setWorkoutNotesRow,
  setWorkoutStatusRow,
} from "@/lib/data/planned-workouts";
import {
  LIGHTEN_FRACTIONS,
  MAX_NOTES_LENGTH,
  STATUS_ACTIONS,
  lightenedDistance,
  normaliseNotes,
  notesChanged,
  notesTooLong,
  parisDate,
  plannedDistance,
  statusTarget,
  validateLighten,
  validateRestore,
  validateStatus,
  weekIndexOf,
  weekStart,
  type LightenCandidate,
  type WorkoutDetail,
} from "@/lib/plan";

/**
 * The four changes the detail view can make to a planned workout.
 *
 * Every one follows the shape `moveWorkout` established. The form data is
 * parsed with a schema before anything else, `requireUser` runs so an expired
 * session is a redirect to the login page rather than a vague failure, the
 * workout is read FRESH and the pure rule is run against that row -- never
 * against anything the client sent -- and only then does the database function
 * run, which re-checks the invariants inside one transaction. A refusal comes
 * back as a message; nothing throws at the client.
 *
 * Each result carries the sentence the toast should show and the sentence to
 * show if its Undo is pressed, both from the one table in
 * src/lib/calendar/change-messages.ts, so the toast and "Recent changes"
 * cannot word the same event differently.
 */

export type ChangeResult =
  | {
      status: "ok";
      /** The plan_events row the Undo button will name. */
      eventId: string;
      workoutId: string;
      message: string;
      undoneMessage: string;
      /**
       * New for every result, so the toast can tell a fresh answer from the
       * one already on screen -- including two identical refusals in a row,
       * which are two separate things the athlete did.
       */
      token: string;
    }
  | { status: "error"; message: string; token: string };

const workoutId = z.uuid();

/** A refusal the athlete cannot act on, so it says what to do instead. */
const GONE = "That session is no longer there.";

function failed(message: string): ChangeResult {
  return { status: "error", message, token: crypto.randomUUID() };
}

/**
 * The outcome of one accepted change, worded from its snapshots.
 *
 * `before` and `after` are the same two objects the SQL function wrote into
 * the event, which is what makes the toast's sentence and the history's
 * sentence the same sentence.
 */
function saved(
  kind: string,
  eventId: string,
  id: string,
  before: ChangeSnapshot,
  after: ChangeSnapshot,
): ChangeResult {
  return {
    status: "ok",
    eventId,
    workoutId: id,
    message: planEventMessage({ kind, status: "accepted", move: null, before, after }),
    undoneMessage: undoneChangeMessage(kind, before),
    token: crypto.randomUUID(),
  };
}

/** Both pages show this workout, so both are revalidated. */
function revalidate(id: string): void {
  revalidatePath(`/workouts/${id}`);
  revalidatePath("/");
}

/** What the lighter-day rules need, read off a freshly read row. */
const candidate = (workout: WorkoutDetail): LightenCandidate => ({
  id: workout.id,
  status: workout.status,
  planned_date: workout.planned_date,
  target_distance_m: workout.target_distance_m,
  original_distance_m: workout.original_distance_m,
});

const notesInputSchema = z.object({
  workoutId,
  // Length is checked after trimming, by `notesTooLong`, so a note is never
  // refused for trailing whitespace. The generous cap here only stops an
  // absurd body being parsed at all.
  notes: z.string().max(MAX_NOTES_LENGTH * 10),
});

export async function editNotes(
  _previous: ChangeResult | null,
  formData: FormData,
): Promise<ChangeResult> {
  const parsed = notesInputSchema.safeParse({
    workoutId: formData.get("workoutId"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return failed("Those notes did not make sense.");

  const { workoutId: id, notes } = parsed.data;
  await requireUser();

  if (notesTooLong(notes)) {
    return failed(`A note is at most ${MAX_NOTES_LENGTH} characters.`);
  }

  try {
    const workout = await readWorkoutDetail(id);
    if (workout === null) return failed(GONE);

    const next = normaliseNotes(notes);
    // Re-checked against the row just read, not against what the form was
    // rendered from: an unchanged save would become the one undoable event
    // and bury the change beneath it.
    if (!notesChanged(notes, workout.notes)) {
      return failed("Those notes are already saved.");
    }

    const outcome = await setWorkoutNotesRow(id, next);
    if (!outcome.ok) return failed(outcome.message);

    revalidate(id);
    return saved(
      "edit_notes",
      outcome.eventId,
      id,
      { notes: workout.notes },
      { notes: next },
    );
  } catch {
    return failed("Could not save the notes. Try again.");
  }
}

const statusInputSchema = z.object({
  workoutId,
  action: z.enum(STATUS_ACTIONS),
});

export async function setStatus(
  _previous: ChangeResult | null,
  formData: FormData,
): Promise<ChangeResult> {
  const parsed = statusInputSchema.safeParse({
    workoutId: formData.get("workoutId"),
    action: formData.get("action"),
  });
  if (!parsed.success) return failed("That change did not make sense.");

  const { workoutId: id, action } = parsed.data;
  await requireUser();

  try {
    const workout = await readWorkoutDetail(id);
    if (workout === null) return failed(GONE);

    const check = validateStatus({ from: workout.status, action });
    if (!check.ok) return failed(statusRejectMessage(check.reason));

    const outcome = await setWorkoutStatusRow(id, statusTarget(action));
    if (!outcome.ok) return failed(outcome.message);

    revalidate(id);
    return saved(
      "set_status",
      outcome.eventId,
      id,
      { status: check.from },
      { status: check.to },
    );
  } catch {
    return failed("Could not change the status. Try again.");
  }
}

const lightenInputSchema = z.object({
  workoutId,
  // A closed set, so the athlete cannot invent a fraction, and the metres are
  // never sent: they are computed below from the row the server just read.
  by: z.coerce.number().refine(
    (value): value is (typeof LIGHTEN_FRACTIONS)[number] =>
      (LIGHTEN_FRACTIONS as readonly number[]).includes(value),
    "Expected one of the two reductions.",
  ),
});

export async function lightenWorkout(
  _previous: ChangeResult | null,
  formData: FormData,
): Promise<ChangeResult> {
  const parsed = lightenInputSchema.safeParse({
    workoutId: formData.get("workoutId"),
    by: formData.get("by"),
  });
  if (!parsed.success) return failed("That reduction did not make sense.");

  const { workoutId: id, by } = parsed.data;
  await requireUser();

  try {
    const workout = await readWorkoutDetail(id);
    if (workout === null) return failed(GONE);

    const check = validateLighten({
      workout: candidate(workout),
      by,
      today: parisDate(new Date()),
    });
    if (!check.ok) return failed(lightenRejectMessage(check.reason));

    // The number on the button, computed here from the plan's own distance
    // rather than taken from the form, and the same number the rounding rule
    // is tested against.
    const base = plannedDistance(candidate(workout));
    if (base === null) return failed("This session has no distance to change.");
    const toM = lightenedDistance(base, by);

    const outcome = await lightenWorkoutRow(id, toM);
    if (!outcome.ok) return failed(outcome.message);

    revalidate(id);
    return saved(
      "lighten_workout",
      outcome.eventId,
      id,
      {
        target_distance_m: workout.target_distance_m,
        original_distance_m: workout.original_distance_m,
      },
      { target_distance_m: toM, original_distance_m: base },
    );
  } catch {
    return failed("Could not make the day lighter. Try again.");
  }
}

export async function restoreDistance(
  _previous: ChangeResult | null,
  formData: FormData,
): Promise<ChangeResult> {
  const parsed = workoutId.safeParse(formData.get("workoutId"));
  if (!parsed.success) return failed("That change did not make sense.");

  const id = parsed.data;
  const user = await requireUser();

  try {
    const workout = await readWorkoutDetail(id);
    if (workout === null) return failed(GONE);

    // The one action here that can RAISE a week's distance: the metres were in
    // the total once, but a run may have been moved into the headroom the
    // lightening freed. So the week is read fresh and the ceiling is checked
    // against what it holds now, not against what the page was built from.
    const weekWorkouts = await readNextWorkouts(
      user.id,
      weekStart(weekIndexOf(workout.planned_date)),
      DAYS_IN_WEEK,
    );

    const check = validateRestore({
      workout: candidate(workout),
      weekWorkouts,
      today: parisDate(new Date()),
    });
    if (!check.ok) return failed(lightenRejectMessage(check.reason));

    const outcome = await restoreDistanceRow(id);
    if (!outcome.ok) return failed(outcome.message);

    revalidate(id);
    return saved(
      "restore_distance",
      outcome.eventId,
      id,
      {
        target_distance_m: workout.target_distance_m,
        original_distance_m: workout.original_distance_m,
      },
      { target_distance_m: check.toM, original_distance_m: null },
    );
  } catch {
    return failed("Could not restore the distance. Try again.");
  }
}
