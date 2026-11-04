/**
 * Maps generated plan weeks onto public.planned_workouts rows. Pure: the
 * Server Action validates the result with zod and inserts it.
 *
 * `target_pace_s_per_km` is deliberately absent. Paces are derived from the
 * athlete's current VDOT at display time, so storing them would freeze a
 * fitness level into the plan.
 */

import { addDays, type Ymd } from "./dates";
import type { Week, WorkoutKind } from "./types";
import type { ZoneKey } from "./vdot";

/** A row of public.planned_workouts, as inserted. */
export type PlannedWorkoutRow = {
  user_id: string;
  /**
   * The generator's session id, e.g. 'w13-d1'. Unique per user, so generating
   * the plan twice is refused; rows added later by hand or by the coach leave
   * it null. Keying on this rather than the date means moving a workout can
   * never collide with the workout already on that day.
   */
  generated_key: string;
  planned_date: Ymd;
  kind: WorkoutKind;
  title: string;
  is_key: boolean;
  target_distance_m: number;
  week_index: number;
  pace_zone: ZoneKey | null;
  strides: boolean;
};

/**
 * Kinds that count as key sessions, for the "two key sessions missed"
 * trigger. Easy, hill-sprint and steady runs do not.
 */
const KEY_KINDS: readonly WorkoutKind[] = [
  "sweet",
  "threshold",
  "interval",
  "tt",
  "race",
  "long",
];

export function isKeyKind(kind: WorkoutKind): boolean {
  return KEY_KINDS.includes(kind);
}

/** Rows the full 78-week plan produces. Pinned by the generator test. */
export const PLAN_SESSION_COUNT = 357;

export function toPlannedRows(weeks: readonly Week[], userId: string): PlannedWorkoutRow[] {
  return weeks.flatMap((week) =>
    week.sessions.map((session) => ({
      user_id: userId,
      generated_key: session.id,
      planned_date: addDays(week.start, session.dow),
      kind: session.kind,
      title: session.title,
      is_key: isKeyKind(session.kind),
      // Integer column; the 25.1 km race row is why this rounds.
      target_distance_m: Math.round(session.km * 1000),
      week_index: week.i,
      pace_zone: session.key,
      strides: session.strides,
    })),
  );
}
