/**
 * The year view's arithmetic: which years exist, what a year covers, and how a
 * year's sessions and runs add up by month.
 *
 * Pure, like the rest of src/lib/calendar. Every instant arrives as an
 * argument, so nothing here reads a clock, and the one time-zone decision --
 * that a month is a Europe/Paris month -- lives in `monthTotals` where it can
 * be tested rather than inside a query.
 */

import { PLAN_START, RACE_DATE, parisDate, type Ymd } from "@/lib/plan";

export const MONTHS_IN_YEAR = 12;

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The calendar year a date falls in. */
export function yearOf(date: Ymd): number {
  const match = YMD.exec(date);
  if (!match) throw new RangeError(`Not a YYYY-MM-DD date: ${date}`);
  return Number(match[1]);
}

/** The month a date falls in, 1 to 12. */
function monthOf(date: Ymd): number {
  const match = YMD.exec(date);
  if (!match) throw new RangeError(`Not a YYYY-MM-DD date: ${date}`);
  return Number(match[2]);
}

/**
 * The calendar years the plan overlaps, derived rather than written down: the
 * plan runs from PLAN_START to RACE_DATE, so moving either constant moves
 * these with it.
 */
export const PLAN_YEARS = {
  first: yearOf(PLAN_START),
  last: yearOf(RACE_DATE),
} as const;

/** The nearest year the plan reaches. A year the plan never sees is not one to show. */
export function clampYear(year: number): number {
  if (!Number.isInteger(year)) throw new RangeError(`Not a year: ${year}`);
  return Math.min(PLAN_YEARS.last, Math.max(PLAN_YEARS.first, year));
}

/** Whether previous or next has anywhere to go. What disables the buttons. */
export function canStepYear(year: number, delta: number): boolean {
  const target = year + delta;
  return target >= PLAN_YEARS.first && target <= PLAN_YEARS.last;
}

export type YearRange = {
  /** 1 January. */
  start: Ymd;
  /** 31 December. */
  end: Ymd;
};

export function yearRange(year: number): YearRange {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

/**
 * The UTC window to ask the database for, which is WIDER than the year.
 *
 * `activities.started_at` is an instant, and a Paris year is not a UTC year:
 * Paris is an hour or two ahead, so 1 January 00:30 in Paris is 31 December in
 * UTC. The read takes a day of slack either side and `monthTotals` discards
 * whatever falls outside the Paris year -- the boundary belongs in a tested
 * function, not in a query string.
 */
export function runWindow(year: number): { from: string; to: string } {
  return { from: `${year - 1}-12-31T00:00:00Z`, to: `${year + 1}-01-02T00:00:00Z` };
}

/** A planned session, as the year read returns it. */
export type PlannedMonthRow = {
  planned_date: Ymd;
  /** Null on a rest day, which counts as 0 rather than as nothing. */
  target_distance_m: number | null;
};

/** A run, as the year read returns it. */
export type RunMonthRow = {
  /** An ISO instant. The Paris calendar date is derived, never stored. */
  started_at: string;
  distance_m: number;
};

export type MonthTotal = {
  /** 1 to 12. */
  month: number;
  /** What was actually run that month, linked to a session or not. */
  loggedM: number;
  /** What the plan asks for that month, whatever each session's status. */
  plannedM: number;
};

/**
 * Twelve months of logged against planned, in metres.
 *
 * Both sides are bucketed by their **Europe/Paris** date. A session already
 * has one: `planned_date` is a Paris calendar date. A run has an instant, so
 * it goes through `parisDate`, which is the same conversion the logbook uses --
 * so a run cannot appear in one month here and another in the list.
 *
 * `logged` counts every run, linked or not: an unlinked run is still a run that
 * happened. `planned` counts every session of any status, so a skipped week
 * stays in the plan total and shows up as the gap it is. A row outside the year
 * is dropped, which is what makes the deliberately wide read in `runWindow`
 * safe.
 */
export function monthTotals(
  planned: readonly PlannedMonthRow[],
  runs: readonly RunMonthRow[],
  year: number,
): MonthTotal[] {
  const totals = Array.from({ length: MONTHS_IN_YEAR }, (_, index) => ({
    month: index + 1,
    loggedM: 0,
    plannedM: 0,
  }));

  for (const row of planned) {
    if (yearOf(row.planned_date) !== year) continue;
    const total = totals[monthOf(row.planned_date) - 1];
    if (total) total.plannedM += row.target_distance_m ?? 0;
  }

  for (const run of runs) {
    const instant = new Date(run.started_at);
    if (Number.isNaN(instant.getTime())) {
      // Loudly, not quietly: a run dropped for an unreadable timestamp would
      // read as a run that never happened.
      throw new RangeError(`Not an instant: ${run.started_at}`);
    }
    const date = parisDate(instant);
    if (yearOf(date) !== year) continue;
    const total = totals[monthOf(date) - 1];
    if (total) total.loggedM += run.distance_m;
  }

  return totals;
}

export type FocusNumbers = {
  /** Whole kilometres: what the card prints. */
  loggedKm: number;
  plannedKm: number;
  /** Never negative. A month run past its plan has nothing left to go. */
  toGoKm: number;
  /** The real percentage, over 100 included, or null with nothing planned. */
  percent: number | null;
  /** The progress bar's width, clamped to 100. */
  barPercent: number;
};

/**
 * The month-in-focus numbers.
 *
 * The kilometres are rounded first and the remainder taken from the rounded
 * pair, so the three numbers on the card agree with each other: 96 of 168 is
 * 72 to go, and never 73 because the metres behind them said 72.8.
 *
 * The percentage is computed from the metres, where the precision actually is,
 * and is NOT clamped -- a month run 112% of plan says so. The bar is clamped,
 * because a bar wider than its track is a rendering bug, not a fact. With
 * nothing planned there is no percentage to state: the card hides both.
 */
export function focusNumbers(loggedM: number, plannedM: number): FocusNumbers {
  const loggedKm = Math.round(loggedM / 1000);
  const plannedKm = Math.round(plannedM / 1000);
  const percent = plannedM === 0 ? null : Math.round((loggedM / plannedM) * 100);

  return {
    loggedKm,
    plannedKm,
    toGoKm: Math.max(0, plannedKm - loggedKm),
    percent,
    barPercent: percent === null ? 0 : Math.min(100, percent),
  };
}
