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

/** numeric(4,1) arrives as a number or a string depending on the client. */
export const vdotSchema = z.coerce.number().min(25).max(85);
