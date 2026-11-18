import "server-only";
import { z } from "zod";
import {
  PICKER_WINDOW_DAYS,
  RUNS_PER_PAGE,
  chosenWorkoutSchema,
  linkableWorkoutsSchema,
  storedRunSchema,
  storedRunsSchema,
  yearRunRowsSchema,
  type ChosenWorkout,
  type LinkableWorkout,
  type ParsedRun,
  type StoredRun,
  type YearRunRow,
} from "@/lib/runs";
import { runWindow } from "@/lib/calendar/year";
import { addDays, type Ymd } from "@/lib/plan/dates";
import { createClient } from "@/lib/supabase/server";
import { POSTGREST_MAX_ROWS, assertAllRows } from "./limits";
import { isRefusal, refusal } from "./rpc";

/**
 * Runs, read and written as the signed-in user. Every call goes through the
 * cookie-based client, so row-level security applies and no service-role key
 * is involved.
 *
 * The three writes are the database functions, which snapshot the linked
 * session's zone and the profile's VDOT inside SQL. Nothing here supplies
 * either: a client that could would defeat the point of the snapshot.
 */

/** The columns a run needs, plus the session it points at. */
const COLUMNS = `
  id, started_at, start_time_known, distance_m, duration_s, avg_hr, hr_source,
  rpe, notes, planned_pace_zone, vdot_used, source, planned_workout_id,
  planned_workout:planned_workouts (title, planned_date, pace_zone, status)
`;

/** The outcome of a run function: the activity's id, or a sentence. */
export type RunOutcome = { ok: true; id: string } | { ok: false; message: string };

function outcome(
  data: unknown,
  error: { code?: string; message: string } | null,
  fault: string,
): RunOutcome {
  if (!error) return { ok: true, id: z.uuid().parse(data) };
  if (isRefusal(error.code)) return { ok: false, message: refusal(error.message) };
  throw new Error(`${fault}: ${error.message}`);
}

/**
 * The parameters the three functions share. Built from a `ParsedRun`, which is
 * what `validateRun` returns, so the Server Action cannot pass a number the
 * rules have not seen.
 *
 * `p_date` and `p_time` are sent apart rather than as one instant: the
 * function composes `started_at` in Europe/Paris, which is where the
 * daylight-saving arithmetic belongs.
 */
function params(run: ParsedRun) {
  return {
    p_date: run.date,
    p_time: run.time,
    p_distance_m: run.distanceM,
    p_duration_s: run.durationS,
    p_avg_hr: run.avgHr,
    p_hr_source: run.hrSource,
    p_rpe: run.rpe,
    p_notes: run.notes,
    p_planned_workout_id: run.plannedWorkoutId,
  };
}

export async function logRunRow(run: ParsedRun): Promise<RunOutcome> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("log_run", params(run));

  return outcome(data, error, "Could not log the run");
}

export async function updateRunRow(id: string, run: ParsedRun): Promise<RunOutcome> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_run", {
    p_activity_id: id,
    ...params(run),
  });

  return outcome(data, error, "Could not save the run");
}

/**
 * `resetWorkout` is the dialog's checkbox. The function refuses it when the
 * run is not linked or when another run still points at the session, so a
 * checkbox can never claim something that did not happen.
 */
export async function deleteRunRow(
  id: string,
  resetWorkout: boolean,
): Promise<RunOutcome> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_run", {
    p_activity_id: id,
    p_reset_workout: resetWorkout,
  });

  return outcome(data, error, "Could not delete the run");
}

/**
 * One page of runs, newest first.
 *
 * Reads one row more than a page shows, so "is there a next page" comes out of
 * this read rather than a second count query; `buildRunList` drops the extra.
 * The order rides activities_user_started_idx, which is (user_id, started_at
 * desc) from the initial schema.
 */
export async function readRuns(userId: string, page: number): Promise<StoredRun[]> {
  const supabase = await createClient();
  const from = (page - 1) * RUNS_PER_PAGE;

  const { data, error } = await supabase
    .from("activities")
    .select(COLUMNS)
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    // Second, so two runs on the same instant come back in a stable order.
    .order("id", { ascending: true })
    .range(from, from + RUNS_PER_PAGE);

  if (error) throw new Error(`Could not read the runs: ${error.message}`);
  // Rows cross a boundary, so they are validated rather than trusted.
  return storedRunsSchema.parse(data);
}

/**
 * A year's runs, as two numbers a month: the instant and the distance.
 *
 * Every run, linked to a session or not -- `planned_workout_id` is not even
 * read. An unlinked run is still a run that happened, and whether the plan
 * claims it is a different question from how far the athlete ran in March.
 *
 * The window is WIDER than the year, by a day either side: `started_at` is an
 * instant and a Paris year is not a UTC year, so 00:30 on 1 January in Paris
 * is 31 December in UTC. `monthTotals` buckets by Paris date and discards the
 * slack, which keeps the boundary arithmetic in a tested function rather than
 * in this query string.
 */
export async function readYearRuns(
  userId: string,
  year: number,
): Promise<YearRunRow[]> {
  const { from, to } = runWindow(year);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activities")
    .select("started_at, distance_m")
    .eq("user_id", userId)
    .gte("started_at", from)
    .lt("started_at", to)
    .order("started_at", { ascending: true })
    .limit(POSTGREST_MAX_ROWS);

  if (error) throw new Error(`Could not read the year's runs: ${error.message}`);

  // A year is some 300 runs, so the limit means something has gone wrong --
  // and a truncated year reads as a year the athlete ran less in than they did.
  assertAllRows(data.length, `The runs for ${year}`);
  // Rows cross a boundary, so they are validated rather than trusted.
  return yearRunRowsSchema.parse(data);
}

/** One run in full by id, or null when it is not the caller's. */
export async function readRunDetail(id: string): Promise<StoredRun | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activities")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Could not read the run: ${error.message}`);
  return data === null ? null : storedRunSchema.parse(data);
}

/** How many runs already point at a session. More than none is a warning. */
export async function countRunsForWorkout(
  workoutId: string,
  exceptRunId?: string,
): Promise<number> {
  const supabase = await createClient();
  let query = supabase
    .from("activities")
    .select("id", { count: "exact", head: true })
    .eq("planned_workout_id", workoutId);

  // When editing, the run being edited is not "another run".
  if (exceptRunId !== undefined) query = query.neq("id", exceptRunId);

  const { count, error } = await query;

  if (error) throw new Error(`Could not count the runs on that session: ${error.message}`);
  return count ?? 0;
}

/**
 * The sessions the form can offer to link to, each with how many runs already
 * point at it.
 *
 * Reads the WIDE window -- ten days either side, not the three the form
 * offers -- so that moving the date field does not need another round trip.
 * `linkableOn` narrows it to whatever date is in the field. Neither window is
 * a rule: `log_run` links a run to any session the athlete owns.
 *
 * The count comes back as an aggregate on the embedded relation rather than a
 * query per row, which is why the select names `activities(count)`.
 */
export async function readLinkableWorkouts(
  userId: string,
  date: Ymd,
  withinDays: number = PICKER_WINDOW_DAYS,
): Promise<LinkableWorkout[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("planned_workouts")
    .select(LINKABLE_COLUMNS)
    .eq("user_id", userId)
    .gte("planned_date", addDays(date, -withinDays))
    .lte("planned_date", addDays(date, withinDays))
    .order("planned_date", { ascending: true })
    .order("day_slot", { ascending: true });

  if (error) throw new Error(`Could not read the sessions: ${error.message}`);

  return linkableWorkoutsSchema.parse((data ?? []).map(withRunCount));
}

/** The columns a linkable session needs, with its run count as an aggregate. */
const LINKABLE_COLUMNS =
  "id, title, planned_date, pace_zone, status, target_distance_m, activities(count)";

/**
 * The embedded count as a plain number.
 *
 * It arrives as `[{ count: n }]`, or `[]` when there are none. Flattened here
 * so the schema and the form see a number rather than either shape.
 */
function withRunCount(row: object) {
  const { activities, ...rest } = row as typeof row & {
    activities: { count: number }[] | null;
  };
  return { ...rest, run_count: activities?.[0]?.count ?? 0 };
}

/**
 * One session the form can link to, by id, or null when it is not the caller's.
 *
 * For logging a run FROM a session, where the session is already chosen and the
 * form shows it rather than a picker. Read by id rather than taken out of the
 * date window: a session the athlete pressed Log run on has to be the one the
 * form logs against, however far its day is from the date in the field.
 */
export async function readLinkableWorkout(
  workoutId: string,
): Promise<ChosenWorkout | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("planned_workouts")
    // Its own note too, which the picker's rows do not carry: it is prefilled
    // into the run's notes field, and it is one row rather than a window.
    .select(`${LINKABLE_COLUMNS}, notes`)
    .eq("id", workoutId)
    .maybeSingle();

  if (error) throw new Error(`Could not read the session: ${error.message}`);
  return data === null ? null : chosenWorkoutSchema.parse(withRunCount(data));
}

/**
 * Every run logged against one session, newest first.
 *
 * Usually none or one. More than one is legitimate -- the form warns and the
 * athlete confirms -- so this returns a list rather than a single row and the
 * session's page shows all of them.
 */
export async function readRunsForWorkout(workoutId: string): Promise<StoredRun[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activities")
    .select(COLUMNS)
    .eq("planned_workout_id", workoutId)
    .order("started_at", { ascending: false });

  if (error) {
    throw new Error(`Could not read the runs on that session: ${error.message}`);
  }
  return storedRunsSchema.parse(data);
}
