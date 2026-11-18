/**
 * The rules for making a day lighter, and for putting the planned distance
 * back. Pure and framework free, like `validateMove`, and for the same
 * reason: one definition that the interface calls for instant feedback and
 * the Server Action calls authoritatively against freshly read rows.
 *
 * Nothing here reads a clock. `today` is an argument.
 *
 * Reasons carry data, never a sentence: the wording lives in
 * src/lib/calendar/move-messages.ts. `week_cap_exceeded` is deliberately the
 * same shape `validateMove` rejects with, so the 60 km ceiling has one
 * sentence rather than two free to drift apart.
 *
 * The asymmetry worth knowing: lightening can only ever lower a week's total,
 * so it needs no ceiling check. Restoring can raise one -- a run may have been
 * moved into the headroom the lightening freed -- so it is checked.
 */

import { WEEKLY_CAP, diffDays, weekIndexOf, type Ymd } from "./dates";
import { CAP_METRES } from "./moves";
import type { WorkoutStatus } from "./types";

/** How much lighter a day can be made. Nothing in between: two clear choices. */
export const LIGHTEN_FRACTIONS = [0.2, 0.4] as const;

export type LightenFraction = (typeof LIGHTEN_FRACTIONS)[number];

/** Distances are rounded to the nearest half kilometre, which is readable. */
export const LIGHTEN_STEP_M = 500;

/** Below this a run is not a run. A lighter day never goes under it. */
export const MIN_LIGHT_DISTANCE_M = 1000;

/**
 * What the rules need from a planned workout: a structural subset of the
 * stored row, so a caller passes rows straight through.
 */
export type LightenCandidate = {
  id: string;
  status: WorkoutStatus;
  planned_date: Ymd;
  target_distance_m: number | null;
  /** The plan's own distance while the day is lightened, else null. */
  original_distance_m: number | null;
};

/** What the ceiling check needs from the other workouts in the week. */
export type WeekMember = {
  id: string;
  planned_date: Ymd;
  target_distance_m: number | null;
};

export type LightenReason =
  | { code: "not_planned"; status: WorkoutStatus }
  | { code: "in_past"; date: Ymd; today: Ymd }
  | { code: "no_distance" }
  | { code: "already_minimum"; metres: number }
  /** Asking for -20% on a day already at -40% would put distance back. */
  | { code: "would_raise"; fromM: number; toM: number }
  | { code: "no_original" }
  | { code: "week_cap_exceeded"; weekIndex: number; metres: number; capKm: number };

/** Every reason code, so the message table can be proved exhaustive. */
export const LIGHTEN_REJECT_CODES = [
  "not_planned",
  "in_past",
  "no_distance",
  "already_minimum",
  "would_raise",
  "no_original",
  "week_cap_exceeded",
] as const;

export type LightenCheck =
  | { ok: true; fromM: number; toM: number }
  | { ok: false; reason: LightenReason };

const metres = (member: WeekMember) => member.target_distance_m ?? 0;

/**
 * The distance the plan asked for, which is what a percentage is taken of.
 *
 * Reading the original first is what stops -40% after -20% compounding: both
 * fractions are always of the plan's own number, so the two buttons mean what
 * they say however often they are pressed.
 */
export function plannedDistance(workout: LightenCandidate): number | null {
  return workout.original_distance_m ?? workout.target_distance_m;
}

/** The distance now, which is what "lighter" has to be lighter than. */
function currentDistance(workout: LightenCandidate): number | null {
  return workout.target_distance_m ?? workout.original_distance_m;
}

/**
 * `baseM` made lighter by `by`, to the nearest half kilometre, never below
 * 1 km and never above the base itself.
 *
 * Clamped at both ends rather than only at the bottom: rounding up from a base
 * already near the floor could otherwise return more than it was given, and
 * "lighter" must never mean longer.
 */
export function lightenedDistance(baseM: number, by: LightenFraction): number {
  const rounded = Math.round((baseM * (1 - by)) / LIGHTEN_STEP_M) * LIGHTEN_STEP_M;
  return Math.min(baseM, Math.max(MIN_LIGHT_DISTANCE_M, rounded));
}

/**
 * Which fractions the interface may offer.
 *
 * A day already at -40% must not be offered -20%: that would put distance
 * back, and the only path that may put distance back is restore, which is the
 * one that checks the ceiling. So the button goes rather than failing on
 * press, and the interface says to restore first.
 */
export function offeredFractions(
  workout: LightenCandidate,
): readonly LightenFraction[] {
  const base = plannedDistance(workout);
  const current = currentDistance(workout);
  if (base === null || current === null) return [];

  return LIGHTEN_FRACTIONS.filter((by) => lightenedDistance(base, by) < current);
}

/** Whether a day can be made lighter by `by`, and by how much. */
export function validateLighten({
  workout,
  by,
  today,
}: {
  workout: LightenCandidate;
  by: LightenFraction;
  today: Ymd;
}): LightenCheck {
  const reject = (reason: LightenReason): LightenCheck => ({ ok: false, reason });

  if (workout.status !== "planned") {
    return reject({ code: "not_planned", status: workout.status });
  }

  // Lighter is a decision about a session still to come. What happened has
  // happened, which is also why `move_planned_workout` refuses a past day.
  if (diffDays(today, workout.planned_date) < 0) {
    return reject({ code: "in_past", date: workout.planned_date, today });
  }

  const base = plannedDistance(workout);
  const current = currentDistance(workout);
  if (base === null || current === null) return reject({ code: "no_distance" });

  const toM = lightenedDistance(base, by);

  // The plan's own distance is already at the floor, so there is nothing to
  // take off it whichever fraction was asked for.
  if (toM >= base) return reject({ code: "already_minimum", metres: base });

  if (toM >= current) {
    return reject({ code: "would_raise", fromM: current, toM });
  }

  return { ok: true, fromM: current, toM };
}

/**
 * Whether any reduction is on offer at all.
 *
 * Built on `validateLighten` rather than beside it: the gate the interface asks
 * is then the same function the Server Action re-runs, and a rule added to
 * `validateLighten` cannot be missed here. Both fractions are tried, because a
 * day that refuses one only for being lighter than it already still has the
 * other.
 */
export function canLighten(workout: LightenCandidate, today: Ymd): boolean {
  return LIGHTEN_FRACTIONS.some((by) => validateLighten({ workout, by, today }).ok);
}

/**
 * Whether the planned distance can be put back.
 *
 * This is the one action in the branch that can raise a week's total, so it
 * runs the 60 km ceiling check -- the same arithmetic `validateMove` runs, on
 * the total *after* the restore, because it is a safety limit.
 *
 * Week membership is derived here with `weekIndexOf` and never taken from the
 * caller, so a caller cannot disagree with the rules about which week a row
 * belongs to. The workout itself is excluded by id whether or not it is in
 * `weekWorkouts`, so its current, lightened distance is never counted
 * alongside the restored one.
 */
export function validateRestore({
  workout,
  weekWorkouts,
  today,
}: {
  workout: LightenCandidate;
  /** Every planned workout in the week that holds it, itself included or not. */
  weekWorkouts: readonly WeekMember[];
  today: Ymd;
}): LightenCheck {
  const reject = (reason: LightenReason): LightenCheck => ({ ok: false, reason });

  if (workout.status !== "planned") {
    return reject({ code: "not_planned", status: workout.status });
  }

  if (diffDays(today, workout.planned_date) < 0) {
    return reject({ code: "in_past", date: workout.planned_date, today });
  }

  const toM = workout.original_distance_m;
  // Nothing was taken off, so there is nothing to put back. Not a state the
  // athlete can reach: the action is only offered on a lightened day.
  if (toM === null) return reject({ code: "no_original" });

  const weekIndex = weekIndexOf(workout.planned_date);
  const after =
    weekWorkouts
      .filter(
        (other) =>
          other.id !== workout.id && weekIndexOf(other.planned_date) === weekIndex,
      )
      .reduce((total, other) => total + metres(other), 0) + toM;

  if (after > CAP_METRES) {
    return reject({
      code: "week_cap_exceeded",
      weekIndex,
      metres: after,
      capKm: WEEKLY_CAP,
    });
  }

  return { ok: true, fromM: workout.target_distance_m ?? 0, toM };
}
