"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { rejectMessage } from "@/lib/calendar";
import {
  countPlannedWorkouts,
  insertPlannedWorkouts,
  moveWorkoutRow,
  readNextWorkouts,
  readWorkout,
  undoPlanEventRow,
} from "@/lib/data/planned-workouts";
import {
  MOVE_WARNING_CODES,
  PLAN_SESSION_COUNT,
  allWeeks,
  diffDays,
  insertRowsSchema,
  moveReadRange,
  parisDate,
  toPlannedRows,
  validateMove,
  type MoveWarning,
} from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export type GeneratePlanState = { error?: string };

const ALREADY_PLANNED = "You already have a plan. Nothing was changed.";

/**
 * Seeds the 78-week plan for the signed-in user, once. Runs as the user, so
 * row-level security applies; refuses if any planned workout already exists,
 * and the unique index catches the race between two submits.
 */
export async function generatePlan(
  _previous: GeneratePlanState,
  formData: FormData,
): Promise<GeneratePlanState> {
  // The submit button carries the intent, as on the login form: a post without
  // it is not a request to generate the plan.
  if (formData.get("intent") !== "generate") return {};

  const user = await requireUser();

  try {
    if ((await countPlannedWorkouts(user.id)) > 0) return { error: ALREADY_PLANNED };

    const parsed = insertRowsSchema.safeParse(toPlannedRows(allWeeks(), user.id));
    if (!parsed.success || parsed.data.length !== PLAN_SESSION_COUNT) {
      return { error: "The generated plan did not pass validation. Nothing was saved." };
    }

    const outcome = await insertPlannedWorkouts(parsed.data);
    if (!outcome.ok) return { error: ALREADY_PLANNED };
  } catch {
    return { error: "Could not save the plan. Try again." };
  }

  revalidatePath("/");
  return {};
}

/**
 * What a move attempt came to. `needs_confirmation` is the third answer the
 * interface cannot always anticipate: the "Move to…" picker can target a date
 * outside the window the page loaded, so the client has no rows to check it
 * against and the server has to be able to say "confirm these first".
 */
export type MoveResult =
  | {
      status: "ok";
      eventId: string;
      workoutId: string;
      title: string;
      from: string;
      to: string;
    }
  | { status: "needs_confirmation"; warnings: readonly MoveWarning[] }
  | { status: "error"; message: string };

/**
 * Undo has its own result: it carries no from/to, because what it restores is
 * whatever the event it reverses recorded, and the page re-reads that anyway.
 */
export type UndoResult =
  | { status: "ok"; eventId: string }
  | { status: "error"; message: string };

const moveInputSchema = z.object({
  workoutId: z.uuid(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date."),
  /**
   * Warnings the athlete has already accepted. Validated against the known
   * codes, so a client cannot invent an override to silence a rule.
   */
  overrides: z.array(z.enum(MOVE_WARNING_CODES)).default([]),
});

const GENERIC_MOVE_ERROR = "Could not move the session. Try again.";

/**
 * Moves a planned workout to another day.
 *
 * The server is authoritative. It reads the workout and the window the rules
 * need, then runs validateMove again on those rows -- the client's own check
 * is only for instant feedback, and nothing it sends about weekly totals is
 * read. Only then does the database function run, which re-checks ownership,
 * the plan bounds, the status and the day's capacity inside one transaction.
 */
export async function moveWorkout(input: unknown): Promise<MoveResult> {
  const parsed = moveInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "That move did not make sense." };
  }

  const { workoutId, toDate, overrides } = parsed.data;
  const user = await requireUser();

  try {
    const workout = await readWorkout(workoutId);
    // Row-level security already scoped the read, so a miss is either a
    // deleted row or another user's. Neither needs its own message.
    if (workout === null) {
      return { status: "error", message: "That session is no longer there." };
    }

    const { from, to } = moveReadRange(workout.planned_date, toDate);
    const weekWorkouts = await readNextWorkouts(
      user.id,
      from,
      diffDays(from, to) + 1,
    );

    const check = validateMove({
      workout,
      toDate,
      weekWorkouts,
      today: parisDate(new Date()),
    });

    if (!check.ok) {
      return { status: "error", message: rejectMessage(check.reason) };
    }

    // Every warning must have been accepted by name. A warning the client
    // never saw -- because it could not see the rows -- lands here.
    const unconfirmed = check.warnings.filter(
      (warning) => !overrides.includes(warning.code),
    );
    if (unconfirmed.length > 0) {
      return { status: "needs_confirmation", warnings: unconfirmed };
    }

    const outcome = await moveWorkoutRow(workoutId, toDate, overrides);
    if (!outcome.ok) return { status: "error", message: outcome.message };

    revalidatePath("/");
    return {
      status: "ok",
      eventId: outcome.eventId,
      workoutId,
      title: workout.title,
      from: workout.planned_date,
      to: toDate,
    };
  } catch {
    return { status: "error", message: GENERIC_MOVE_ERROR };
  }
}

/**
 * Reverses one move, by event id.
 *
 * It takes the id rather than finding the latest itself, so "undo this" can
 * never undo something the athlete did not see. The database refuses an id
 * that is not the newest undoable event, and that refusal is passed through.
 */
export async function undoLastMove(eventId: unknown): Promise<UndoResult> {
  const parsed = z.uuid().safeParse(eventId);
  if (!parsed.success) {
    return { status: "error", message: "There is nothing to undo." };
  }

  // Not used below: the database scopes the undo by auth.uid(). Called so an
  // unauthenticated request redirects to the login page rather than being
  // told, vaguely, that the undo failed.
  await requireUser();

  try {
    const outcome = await undoPlanEventRow(parsed.data);
    if (!outcome.ok) return { status: "error", message: outcome.message };

    revalidatePath("/");
    return { status: "ok", eventId: outcome.eventId };
  } catch {
    return { status: "error", message: "Could not undo that change. Try again." };
  }
}
