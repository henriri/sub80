import "server-only";
import { addDays, type Ymd } from "@/lib/plan/dates";
import type { PlannedWorkoutRow } from "@/lib/plan/rows";
import { storedWorkoutsSchema, vdotSchema, type StoredWorkout } from "@/lib/plan/rows-schema";
import { createClient } from "@/lib/supabase/server";

/**
 * Planned workouts, read and written as the signed-in user. Every call goes
 * through the cookie-based client, so row-level security applies and no
 * service-role key is involved.
 */

const COLUMNS =
  "id, generated_key, planned_date, kind, title, is_key, target_distance_m, week_index, pace_zone, strides";

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
    .order("planned_date", { ascending: true });

  if (error) throw new Error(`Could not read planned workouts: ${error.message}`);
  // Rows cross a boundary, so they are validated rather than trusted.
  return storedWorkoutsSchema.parse(data);
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
