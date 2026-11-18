/**
 * Schemas for planned workouts crossing a boundary: rows on their way into
 * Postgres, and rows read back out of it.
 */

import { z } from "zod";
import { MAX_WEEK } from "./dates";
import { WORKOUT_KINDS, WORKOUT_STATUSES } from "./types";
import { ZONE_KEYS } from "./vdot";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date.");

/** The generator's session id: week and day of week. */
const generatedKey = z.string().regex(/^w([1-9]|[1-7][0-9])-d[0-6]$/, "Expected a key like w13-d1.");

/** One row as generated, before insert. Every generated row carries its key. */
export const insertRowSchema = z.object({
  user_id: z.uuid(),
  generated_key: generatedKey,
  planned_date: ymd,
  kind: z.enum(WORKOUT_KINDS),
  title: z.string().min(1),
  is_key: z.boolean(),
  target_distance_m: z.int().positive(),
  week_index: z.int().min(1).max(MAX_WEEK),
  pace_zone: z.enum(ZONE_KEYS).nullable(),
  strides: z.boolean(),
});

/** The whole plan. The row count is part of the contract. */
export const insertRowsSchema = z.array(insertRowSchema);

/**
 * Order within the day: 0 first, 1 second. A literal union rather than
 * z.int().min(0).max(1), so the type carries the two cases the move rules
 * branch on and `day_slot in (0, 1)` on the column has an exact counterpart.
 */
const daySlot = z.union([z.literal(0), z.literal(1)]);

/** One row read back from Postgres, for display. */
export const storedWorkoutSchema = z.object({
  id: z.uuid(),
  // Null on a row added by hand or by the coach.
  generated_key: generatedKey.nullable(),
  planned_date: ymd,
  kind: z.enum(WORKOUT_KINDS),
  title: z.string().min(1),
  is_key: z.boolean(),
  target_distance_m: z.int().positive().nullable(),
  week_index: z.int().min(1).max(MAX_WEEK),
  pace_zone: z.enum(ZONE_KEYS).nullable(),
  strides: z.boolean(),
  // Only a planned workout may be moved, so the move rules need the status.
  status: z.enum(WORKOUT_STATUSES),
  day_slot: daySlot,
});

export const storedWorkoutsSchema = z.array(storedWorkoutSchema);

export type StoredWorkout = z.infer<typeof storedWorkoutSchema>;

/**
 * One session as the year view reads it: a date and a distance, nothing else.
 *
 * Its own schema rather than `storedWorkoutSchema`, because a year is some 400
 * rows and the chart adds up two numbers per month. Nothing here is rendered
 * as a session, so the kind, the title, the zone and the status are not read.
 */
export const yearPlannedRowSchema = z.object({
  planned_date: ymd,
  /** Null on a rest day, which the totals count as 0. */
  target_distance_m: z.int().positive().nullable(),
});

export const yearPlannedRowsSchema = z.array(yearPlannedRowSchema);

export type YearPlannedRow = z.infer<typeof yearPlannedRowSchema>;

/**
 * One row read back for the detail view, which shows what a card has no room
 * for. A separate schema rather than more columns on storedWorkoutSchema: the
 * calendar reads six weeks of rows at a time and has no use for a note.
 */
export const workoutDetailSchema = storedWorkoutSchema.extend({
  notes: z.string().nullable(),
  /** The plan's own distance while the day has been made lighter, else null. */
  original_distance_m: z.int().positive().nullable(),
  target_duration_s: z.int().positive().nullable(),
});

export type WorkoutDetail = z.infer<typeof workoutDetailSchema>;

/**
 * A run logged against a session, as the calendar embeds it.
 *
 * Only what a card shows. The snapshots, the note and the source belong to the
 * run's own pages; the calendar is reading six weeks of sessions at a time and
 * a card has room for the numbers and nothing else.
 */
export const workoutRunSchema = z.object({
  id: z.uuid(),
  /** An ISO instant. The Paris calendar date is derived, never stored. */
  started_at: z.string().min(1),
  distance_m: z.int().nonnegative(),
  duration_s: z.int().positive(),
  avg_hr: z.int().nullable(),
  /** Null exactly when `avg_hr` is: the two are never apart, nor mixed. */
  hr_source: z.enum(["strap", "wrist"]).nullable(),
  rpe: z.int().min(1).max(10).nullable(),
});

export type WorkoutRun = z.infer<typeof workoutRunSchema>;

/**
 * The runs on a session, however PostgREST decided to send them.
 *
 * `activities.planned_workout_id` is half of a COMPOSITE foreign key --
 * `(user_id, planned_workout_id)` -> `(user_id, id)` -- and whether PostgREST
 * infers that as a to-many and sends an array or as a to-one and sends a single
 * object is not something this repo can check: the `database` CI job runs the
 * migrations and pgTAP, neither of which goes through PostgREST at all. So both
 * shapes are accepted and normalised to one, exactly as `storedRunSchema` does
 * for the embed in the other direction, rather than guessing and having the
 * calendar fail on a row the database answered perfectly well.
 */
const embeddedRuns = z.preprocess((value) => {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}, z.array(workoutRunSchema));

/**
 * One row read back for the calendar, with what actually happened on it.
 *
 * A session is completed if and only if a run is linked to it, so the calendar
 * cannot say whether a day is done without reading the runs: the status column
 * is a consequence, not the fact.
 */
export const storedWorkoutWithRunsSchema = storedWorkoutSchema.extend({
  runs: embeddedRuns,
});

export const storedWorkoutsWithRunsSchema = z.array(storedWorkoutWithRunsSchema);

export type StoredWorkoutWithRuns = z.infer<typeof storedWorkoutWithRunsSchema>;

/** numeric(4,1) arrives as a number or a string depending on the client. */
export const vdotSchema = z.coerce.number().min(25).max(85);
