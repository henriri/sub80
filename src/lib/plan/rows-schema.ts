/**
 * Schemas for planned workouts crossing a boundary: rows on their way into
 * Postgres, and rows read back out of it.
 */

import { z } from "zod";
import { MAX_WEEK } from "./dates";
import { WORKOUT_KINDS } from "./types";
import { ZONE_KEYS } from "./vdot";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date.");

/** One row as generated, before insert. */
export const insertRowSchema = z.object({
  user_id: z.uuid(),
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

/** One row read back from Postgres, for display. */
export const storedWorkoutSchema = z.object({
  id: z.uuid(),
  planned_date: ymd,
  kind: z.enum(WORKOUT_KINDS),
  title: z.string().min(1),
  is_key: z.boolean(),
  target_distance_m: z.int().positive().nullable(),
  week_index: z.int().min(1).max(MAX_WEEK),
  pace_zone: z.enum(ZONE_KEYS).nullable(),
  strides: z.boolean(),
});

export const storedWorkoutsSchema = z.array(storedWorkoutSchema);

export type StoredWorkout = z.infer<typeof storedWorkoutSchema>;

/** numeric(4,1) arrives as a number or a string depending on the client. */
export const vdotSchema = z.coerce.number().min(25).max(85);
