/**
 * The rules for moving a planned workout to another day. Pure and framework
 * free: `validateMove` is the single definition both the client (for instant
 * feedback) and the Server Action (authoritative) call, so a drop the client
 * allows is one the server allows for the same reason.
 *
 * Nothing here reads a clock. `today` is an argument, like `parisDate(now)`.
 *
 * Reasons and warnings carry data, never a sentence: the wording lives in
 * src/lib/calendar/move-messages.ts. A warning's `code` is also what is
 * persisted in plan_events.payload.overrides, so it is a stored identifier and
 * must not be renamed to suit a dialog.
 */

import {
  MAX_WEEK,
  WEEKLY_CAP,
  addDays,
  diffDays,
  weekIndexOf,
  weekStart,
  type Ymd,
} from "./dates";
import type { WorkoutStatus } from "./types";

/** Sessions a week may hold. A double day counts as two. */
export const MAX_RUNS_PER_WEEK = 5;
/** Sessions a day may hold, which is what day_slot's two values encode. */
export const MAX_PER_DAY = 2;

const CAP_METRES = WEEKLY_CAP * 1000;

/**
 * What the rules need from a planned workout: a structural subset of
 * StoredWorkout, so a caller passes rows straight through and a test need not
 * invent pace zones.
 */
export type MoveCandidate = {
  id: string;
  planned_date: Ymd;
  target_distance_m: number | null;
  is_key: boolean;
  status: WorkoutStatus;
  day_slot: number;
  /** For the dialog copy, which names the session a day would be shared with. */
  title: string;
};

export type ValidateMoveInput = {
  workout: MoveCandidate;
  toDate: Ymd;
  /**
   * Every planned workout in the source week, the destination week, and the
   * calendar day either side of the destination. `moveReadRange` returns
   * exactly that window, so use it rather than assembling one by hand.
   *
   * Week membership is derived here with `weekIndexOf` and never taken from
   * the caller, so a caller cannot disagree with the rules about which week a
   * row belongs to. The moved workout may be present or absent; it is
   * excluded by id either way.
   */
  weekWorkouts: readonly MoveCandidate[];
  /** Today in Europe/Paris. */
  today: Ymd;
};

export type RejectReason =
  | { code: "not_planned"; status: WorkoutStatus }
  | { code: "same_date"; date: Ymd }
  | { code: "source_in_past"; date: Ymd; today: Ymd }
  | { code: "destination_in_past"; date: Ymd; today: Ymd }
  | { code: "outside_plan"; date: Ymd }
  | { code: "day_full"; date: Ymd; max: number }
  | { code: "week_runs_exceeded"; weekIndex: number; runs: number; max: number }
  | { code: "week_cap_exceeded"; weekIndex: number; metres: number; capKm: number };

/** A session a day or a neighbouring day already holds. */
export type MoveNeighbour = { id: string; title: string; isKey: boolean };

export type MoveWarning =
  | {
      code: "double_day";
      date: Ymd;
      other: MoveNeighbour;
      /** Both sessions on the day would be key ones. The dialog says so. */
      bothKey: boolean;
    }
  | {
      code: "consecutive_key";
      date: Ymd;
      neighbourDate: Ymd;
      neighbour: MoveNeighbour;
      /** Whether the neighbouring key session is the day before or after. */
      side: "before" | "after";
    };

export type MoveCheck =
  | { ok: true; warnings: readonly MoveWarning[] }
  | { ok: false; reason: RejectReason };

/** Every warning code, so the message table can be proved exhaustive. */
export const MOVE_WARNING_CODES = ["double_day", "consecutive_key"] as const;

/** Every reject code, likewise. */
export const MOVE_REJECT_CODES = [
  "not_planned",
  "same_date",
  "source_in_past",
  "destination_in_past",
  "outside_plan",
  "day_full",
  "week_runs_exceeded",
  "week_cap_exceeded",
] as const;

const metres = (workout: MoveCandidate) => workout.target_distance_m ?? 0;

/**
 * The date range `weekWorkouts` must cover: both whole weeks, plus the day
 * either side of the destination.
 *
 * Those two extra days are what make a Sunday-to-Monday pair of key sessions
 * visible. The neighbour then sits in a third week, which neither the source
 * nor the destination week covers, so without them the consecutive-key warning
 * would silently not fire at a week boundary.
 */
export function moveReadRange(fromDate: Ymd, toDate: Ymd): { from: Ymd; to: Ymd } {
  // weekStart handles dates before the plan too: weekIndexOf goes to 0 and
  // below, and weekStart(0) is the Monday a week before PLAN_START.
  const mondayOf = (date: Ymd) => weekStart(weekIndexOf(date));
  const earliest = (a: Ymd, b: Ymd) => (diffDays(a, b) < 0 ? b : a);
  const latest = (a: Ymd, b: Ymd) => (diffDays(a, b) > 0 ? b : a);

  const fromMonday = mondayOf(fromDate);
  const toMonday = mondayOf(toDate);

  return {
    from: earliest(earliest(fromMonday, toMonday), addDays(toDate, -1)),
    to: latest(
      latest(addDays(fromMonday, 6), addDays(toMonday, 6)),
      addDays(toDate, 1),
    ),
  };
}

/** The slot a workout would take on a day, or null when the day is full. */
export function nextFreeSlot(dayWorkouts: readonly MoveCandidate[]): 0 | 1 | null {
  const taken = new Set(dayWorkouts.map((workout) => workout.day_slot));
  if (!taken.has(0)) return 0;
  if (!taken.has(1)) return 1;
  return null;
}

function inPlan(date: Ymd): boolean {
  const week = weekIndexOf(date);
  return week >= 1 && week <= MAX_WEEK;
}

/**
 * Whether a move is allowed, and what the athlete must confirm first.
 *
 * Rejections are checked in a fixed order, cheapest and most fundamental
 * first, so one move only ever has one reason. A rejection always wins over a
 * warning: a day that is both full and shared is simply full.
 */
export function validateMove({
  workout,
  toDate,
  weekWorkouts,
  today,
}: ValidateMoveInput): MoveCheck {
  const reject = (reason: RejectReason): MoveCheck => ({ ok: false, reason });

  if (workout.status !== "planned") {
    return reject({ code: "not_planned", status: workout.status });
  }

  if (toDate === workout.planned_date) {
    return reject({ code: "same_date", date: toDate });
  }

  // A workout that has already happened is history, not a plan, so it cannot
  // be moved and nothing can be moved onto a past day.
  if (diffDays(today, workout.planned_date) < 0) {
    return reject({ code: "source_in_past", date: workout.planned_date, today });
  }

  if (diffDays(today, toDate) < 0) {
    return reject({ code: "destination_in_past", date: toDate, today });
  }

  if (!inPlan(toDate)) {
    return reject({ code: "outside_plan", date: toDate });
  }

  // The moved workout is excluded everywhere below: it is leaving its old day
  // and week, so counting it in either would double it.
  const others = weekWorkouts.filter((other) => other.id !== workout.id);

  const onDestinationDay = others.filter((other) => other.planned_date === toDate);
  const slot = nextFreeSlot(onDestinationDay);
  if (slot === null) {
    return reject({ code: "day_full", date: toDate, max: MAX_PER_DAY });
  }

  const fromWeek = weekIndexOf(workout.planned_date);
  const toWeek = weekIndexOf(toDate);

  // Moving inside one week changes neither the run count nor the distance, so
  // the weekly limits are not consulted at all. Deriving that from the
  // arithmetic would work today but would turn a week that is somehow already
  // over a limit into a week nothing can be rearranged in.
  if (toWeek !== fromWeek) {
    const inDestinationWeek = others.filter(
      (other) => weekIndexOf(other.planned_date) === toWeek,
    );

    const runs = inDestinationWeek.length + 1;
    if (runs > MAX_RUNS_PER_WEEK) {
      return reject({
        code: "week_runs_exceeded",
        weekIndex: toWeek,
        runs,
        max: MAX_RUNS_PER_WEEK,
      });
    }

    // The 60 km ceiling exists because of a pubalgia history. It is a safety
    // limit, so this compares the total after the move, not the total before.
    const after = inDestinationWeek.reduce((total, other) => total + metres(other), 0) +
      metres(workout);
    if (after > CAP_METRES) {
      return reject({
        code: "week_cap_exceeded",
        weekIndex: toWeek,
        metres: after,
        capKm: WEEKLY_CAP,
      });
    }
  }

  return { ok: true, warnings: warningsFor(workout, toDate, others, onDestinationDay) };
}

function warningsFor(
  workout: MoveCandidate,
  toDate: Ymd,
  others: readonly MoveCandidate[],
  onDestinationDay: readonly MoveCandidate[],
): MoveWarning[] {
  const warnings: MoveWarning[] = [];

  const [other] = onDestinationDay;
  if (other) {
    warnings.push({
      code: "double_day",
      date: toDate,
      other: { id: other.id, title: other.title, isKey: other.is_key },
      bothKey: other.is_key && workout.is_key,
    });
  }

  // Only a key session can start a hard-day-next-to-hard-day pattern, so an
  // easy run never raises this however it is surrounded.
  if (workout.is_key) {
    for (const side of ["before", "after"] as const) {
      const neighbourDate = addDays(toDate, side === "before" ? -1 : 1);
      const neighbour = others.find(
        (candidate) => candidate.planned_date === neighbourDate && candidate.is_key,
      );

      if (neighbour) {
        warnings.push({
          code: "consecutive_key",
          date: toDate,
          neighbourDate,
          neighbour: { id: neighbour.id, title: neighbour.title, isKey: true },
          side,
        });
      }
    }
  }

  return warnings;
}
