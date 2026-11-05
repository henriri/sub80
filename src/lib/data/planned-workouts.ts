import "server-only";
import { z } from "zod";
import { addDays, type Ymd } from "@/lib/plan/dates";
import type { PlannedWorkoutRow } from "@/lib/plan/rows";
import {
  storedWorkoutSchema,
  storedWorkoutsSchema,
  vdotSchema,
  type StoredWorkout,
} from "@/lib/plan/rows-schema";
import { createClient } from "@/lib/supabase/server";

/**
 * Planned workouts, read and written as the signed-in user. Every call goes
 * through the cookie-based client, so row-level security applies and no
 * service-role key is involved.
 */

const COLUMNS =
  "id, generated_key, planned_date, kind, title, is_key, target_distance_m, week_index, pace_zone, strides, status, day_slot";

/** Unique violation: a row with this generated_key already exists. */
const UNIQUE_VIOLATION = "23505";

export async function countPlannedWorkouts(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("planned_workouts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) throw new Error(`Could not count planned workouts: ${error.message}`);
  return count ?? 0;
}

/** The athlete's current VDOT. Every displayed pace is derived from it. */
export async function readVdot(userId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("vdot")
    .eq("id", userId)
    .single();

  if (error) throw new Error(`Could not read the profile: ${error.message}`);
  return vdotSchema.parse(data.vdot);
}

/** Workouts from `from` (inclusive) over the next `days` days. */
export async function readNextWorkouts(
  userId: string,
  from: Ymd,
  days: number,
): Promise<StoredWorkout[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("planned_workouts")
    .select(COLUMNS)
    .eq("user_id", userId)
    .gte("planned_date", from)
    .lt("planned_date", addDays(from, days))
    .order("planned_date", { ascending: true })
    // Second, so a double day always comes back in the order it is shown in.
    .order("day_slot", { ascending: true });

  if (error) throw new Error(`Could not read planned workouts: ${error.message}`);
  // Rows cross a boundary, so they are validated rather than trusted.
  return storedWorkoutsSchema.parse(data);
}

/** One workout by id, or null when it is not the caller's. */
export async function readWorkout(id: string): Promise<StoredWorkout | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("planned_workouts")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Could not read the planned workout: ${error.message}`);
  return data === null ? null : storedWorkoutSchema.parse(data);
}

/**
 * The outcome of a database function that refuses a move. The functions raise
 * with a message written for the athlete, so it is passed through rather than
 * replaced -- but only for the codes they raise deliberately. Anything else is
 * a fault and throws.
 */
export type RpcOutcome = { ok: true; eventId: string } | { ok: false; message: string };

/** Raised by the move and undo functions for a refusal, not a fault. */
const RAISE_EXCEPTION = "P0001";
const NO_DATA_FOUND = "P0002";

/** `move_planned_workout: the workout is completed, not planned` -> the tail. */
function refusal(message: string): string {
  const [, detail] = message.split(/^[a-z_]+: /);
  const sentence = (detail ?? message).trim();
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
}

/**
 * Moves the workout and records the event, in one transaction. The database
 * re-checks ownership, the plan bounds, the status and the day's capacity; the
 * weekly limits were already checked by validateMove in the action.
 */
export async function moveWorkoutRow(
  workoutId: string,
  toDate: Ymd,
  overrides: readonly string[],
): Promise<RpcOutcome> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("move_planned_workout", {
    p_workout_id: workoutId,
    p_to_date: toDate,
    p_overrides: overrides,
  });

  if (!error) return { ok: true, eventId: z.uuid().parse(data) };
  if (error.code === RAISE_EXCEPTION || error.code === NO_DATA_FOUND) {
    return { ok: false, message: refusal(error.message) };
  }
  throw new Error(`Could not move the workout: ${error.message}`);
}

/** Reverses one move. Only the caller's newest undoable one; undo is a stack. */
export async function undoPlanEventRow(eventId: string): Promise<RpcOutcome> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("undo_plan_event", {
    p_event_id: eventId,
  });

  if (!error) return { ok: true, eventId: z.uuid().parse(data) };
  if (error.code === RAISE_EXCEPTION || error.code === NO_DATA_FOUND) {
    return { ok: false, message: refusal(error.message) };
  }
  throw new Error(`Could not undo the change: ${error.message}`);
}

export type InsertOutcome = { ok: true } | { ok: false; duplicate: true };

/**
 * Inserts the whole plan in one statement, so it either all lands or none of
 * it does. A concurrent second submit hits the unique index on
 * (user_id, generated_key) and is rolled back as a whole.
 */
export async function insertPlannedWorkouts(
  rows: readonly PlannedWorkoutRow[],
): Promise<InsertOutcome> {
  const supabase = await createClient();
  const { error } = await supabase.from("planned_workouts").insert(rows);

  if (!error) return { ok: true };
  if (error.code === UNIQUE_VIOLATION) return { ok: false, duplicate: true };
  throw new Error(`Could not insert the plan: ${error.message}`);
}
