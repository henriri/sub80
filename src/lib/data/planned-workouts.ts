import "server-only";
import { z } from "zod";
import { yearRange } from "@/lib/calendar/year";
import { addDays, type Ymd } from "@/lib/plan/dates";
import type { PlannedWorkoutRow } from "@/lib/plan/rows";
import {
  storedWorkoutSchema,
  storedWorkoutsWithRunsSchema,
  vdotSchema,
  workoutDetailSchema,
  yearPlannedRowsSchema,
  type StoredWorkout,
  type StoredWorkoutWithRuns,
  type WorkoutDetail,
  type YearPlannedRow,
} from "@/lib/plan/rows-schema";
import type { WorkoutStatus } from "@/lib/plan/types";
import { createClient } from "@/lib/supabase/server";
import { POSTGREST_MAX_ROWS, assertAllRows } from "./limits";
import { isRefusal, refusal } from "./rpc";

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

/**
 * The runs on a session, embedded, because the calendar has to read them.
 *
 * A session is completed if and only if a run is linked to it, so "is this day
 * done" cannot be answered from the status column alone: that column is a
 * consequence of logging, and a legacy row can say `completed` with nothing
 * behind it. Only the numbers a card shows are read.
 *
 * How the embed comes back is the one thing CI cannot check -- see
 * `storedWorkoutWithRunsSchema`, which accepts either shape.
 */
const RUN_COLUMNS =
  "runs:activities (id, started_at, distance_m, duration_s, avg_hr, hr_source, rpe)";

/** Workouts from `from` (inclusive) over the next `days` days, with their runs. */
export async function readNextWorkouts(
  userId: string,
  from: Ymd,
  days: number,
): Promise<StoredWorkoutWithRuns[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("planned_workouts")
    .select(`${COLUMNS}, ${RUN_COLUMNS}`)
    .eq("user_id", userId)
    .gte("planned_date", from)
    .lt("planned_date", addDays(from, days))
    .order("planned_date", { ascending: true })
    // Second, so a double day always comes back in the order it is shown in.
    .order("day_slot", { ascending: true });

  if (error) throw new Error(`Could not read planned workouts: ${error.message}`);
  // Rows cross a boundary, so they are validated rather than trusted.
  return storedWorkoutsWithRunsSchema.parse(data);
}

/**
 * A year's sessions, as two numbers a month: the date and the distance.
 *
 * Every status, deliberately. A session skipped is still what the plan asked
 * for, so it stays in the planned total and the shortfall shows up as the gap
 * it is -- which is the whole point of the year chart.
 *
 * The distance read is `target_distance_m`, the plan as it stands: a day made
 * lighter counts as the lighter number, not as the original with a gap the
 * athlete never created. `original_distance_m` is not read here.
 */
export async function readYearPlanned(
  userId: string,
  year: number,
): Promise<YearPlannedRow[]> {
  const { start, end } = yearRange(year);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("planned_workouts")
    .select("planned_date, target_distance_m")
    .eq("user_id", userId)
    .gte("planned_date", start)
    .lte("planned_date", end)
    .order("planned_date", { ascending: true })
    .limit(POSTGREST_MAX_ROWS);

  if (error) throw new Error(`Could not read the year's sessions: ${error.message}`);

  // A year is some 400 rows, so the limit means something has gone wrong --
  // and a truncated year reads as a plan that asked for less than it did.
  assertAllRows(data.length, `The sessions for ${year}`);
  // Rows cross a boundary, so they are validated rather than trusted.
  return yearPlannedRowsSchema.parse(data);
}

/**
 * Everything the detail view shows. Its own column list rather than more
 * columns on COLUMNS: the notes and the original distance are read for one
 * workout, never for the six weeks of them a month grid asks for.
 */
const DETAIL_COLUMNS = `${COLUMNS}, notes, original_distance_m, target_duration_s`;

/** One workout in full by id, or null when it is not the caller's. */
export async function readWorkoutDetail(id: string): Promise<WorkoutDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("planned_workouts")
    .select(DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Could not read the planned workout: ${error.message}`);
  // Rows cross a boundary, so they are validated rather than trusted.
  return data === null ? null : workoutDetailSchema.parse(data);
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
  if (isRefusal(error.code)) {
    return { ok: false, message: refusal(error.message) };
  }
  throw new Error(`Could not move the workout: ${error.message}`);
}

/**
 * The four changes the detail view makes. Each is one transaction in which the
 * workout is updated and its plan_events row is written, and each returns that
 * event's id, so the toast can offer an undo for the change just made.
 *
 * None of them takes the client's word for what the rules decide. The notes
 * are trimmed and length-checked, the status must be one of the three, and the
 * lighter distance is the number the Server Action computed with
 * `lightenedDistance` from the row it had just read. What the database adds is
 * the invariants: a planned status and a date that is not past where those
 * matter, and a lighter day that is strictly lighter -- which is what makes it
 * safe for that path not to check the weekly ceiling.
 */
export async function setWorkoutNotesRow(
  workoutId: string,
  notes: string | null,
): Promise<RpcOutcome> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_workout_notes", {
    p_workout_id: workoutId,
    p_notes: notes,
  });

  if (!error) return { ok: true, eventId: z.uuid().parse(data) };
  if (isRefusal(error.code)) {
    return { ok: false, message: refusal(error.message) };
  }
  throw new Error(`Could not save the notes: ${error.message}`);
}

export async function setWorkoutStatusRow(
  workoutId: string,
  to: WorkoutStatus,
): Promise<RpcOutcome> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_workout_status", {
    p_workout_id: workoutId,
    p_to: to,
  });

  if (!error) return { ok: true, eventId: z.uuid().parse(data) };
  if (isRefusal(error.code)) {
    return { ok: false, message: refusal(error.message) };
  }
  throw new Error(`Could not change the status: ${error.message}`);
}

export async function lightenWorkoutRow(
  workoutId: string,
  toDistanceM: number,
): Promise<RpcOutcome> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lighten_planned_workout", {
    p_workout_id: workoutId,
    p_to_distance_m: toDistanceM,
  });

  if (!error) return { ok: true, eventId: z.uuid().parse(data) };
  if (isRefusal(error.code)) {
    return { ok: false, message: refusal(error.message) };
  }
  throw new Error(`Could not make the day lighter: ${error.message}`);
}

export async function restoreDistanceRow(workoutId: string): Promise<RpcOutcome> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restore_planned_distance", {
    p_workout_id: workoutId,
  });

  if (!error) return { ok: true, eventId: z.uuid().parse(data) };
  if (isRefusal(error.code)) {
    return { ok: false, message: refusal(error.message) };
  }
  throw new Error(`Could not restore the distance: ${error.message}`);
}

/**
 * Reverses one change of any kind, by writing the event's `before` snapshot
 * back. Only the caller's newest undoable one; undo is a stack.
 */
export async function undoPlanEventRow(eventId: string): Promise<RpcOutcome> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("undo_plan_event", {
    p_event_id: eventId,
  });

  if (!error) return { ok: true, eventId: z.uuid().parse(data) };
  if (isRefusal(error.code)) {
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
