/**
 * Schemas for runs crossing a boundary: rows read back out of Postgres, and
 * the form data a Server Action is handed.
 *
 * Rows are validated rather than trusted, as planned workouts are. The one
 * place a loose wire type is coerced is `vdot_used`: numeric(4,1) arrives as a
 * number or a string depending on the client, and the union puts null first so
 * that a missing snapshot stays null instead of being coerced to zero.
 */

import { z } from "zod";
import { ZONE_KEYS } from "@/lib/plan";
import { HR_SOURCES, MAX_RPE, MAX_HR, MIN_HR, MIN_RPE, RUN_SOURCES } from "./rules";

/** numeric(4,1), nullable. Null first, so null is never coerced to 0. */
const nullableVdot = z.union([z.null(), z.coerce.number().min(25).max(85)]);

/** The session a run points at, embedded by the row read. */
const linkedWorkoutSchema = z.object({
  title: z.string().min(1),
  planned_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pace_zone: z.enum(ZONE_KEYS).nullable(),
  status: z.string().min(1),
});

/** One activity row, as the run list and the detail view read it. */
export const storedRunSchema = z.object({
  id: z.uuid(),
  /** An ISO instant. The Paris calendar date is derived, never stored. */
  started_at: z.string().min(1),
  start_time_known: z.boolean(),
  distance_m: z.int().nonnegative(),
  duration_s: z.int().positive(),
  avg_hr: z.int().min(MIN_HR).max(MAX_HR).nullable(),
  hr_source: z.enum(HR_SOURCES).nullable(),
  rpe: z.int().min(MIN_RPE).max(MAX_RPE).nullable(),
  notes: z.string().nullable(),
  /** Snapshot: the zone the linked session asked for, on the day it was linked. */
  planned_pace_zone: z.enum(ZONE_KEYS).nullable(),
  /** Snapshot: the profile's configured VDOT then. Not a measured fitness. */
  vdot_used: nullableVdot,
  source: z.enum(RUN_SOURCES),
  planned_workout_id: z.uuid().nullable(),
  planned_workout: linkedWorkoutSchema.nullable(),
});

export const storedRunsSchema = z.array(storedRunSchema);

export type StoredRun = z.infer<typeof storedRunSchema>;
export type LinkedWorkout = z.infer<typeof linkedWorkoutSchema>;

/** A planned session the form can offer to link to, with its run count. */
export const linkableWorkoutSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  planned_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pace_zone: z.enum(ZONE_KEYS).nullable(),
  status: z.string().min(1),
  target_distance_m: z.int().positive().nullable(),
  /** How many runs already point at it. More than none is a warning. */
  run_count: z.int().nonnegative(),
});

export const linkableWorkoutsSchema = z.array(linkableWorkoutSchema);

export type LinkableWorkout = z.infer<typeof linkableWorkoutSchema>;
