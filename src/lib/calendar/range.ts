/**
 * The date ranges each view shows, and how previous and next move.
 *
 * Everything is built on `src/lib/plan/dates`, so the arithmetic runs in UTC
 * and a daylight-saving change cannot shift a day.
 */

import { addDays, dayOfWeek, type Ymd } from "@/lib/plan";
import type { CalendarView } from "./params";

export const DAYS_IN_WEEK = 7;
/**
 * Six Monday-first rows. A 31-day month starting on a Sunday needs 37 cells,
 * so six rows always fit, and the grid never changes height between months.
 */
export const MONTH_GRID_ROWS = 6;
export const MONTH_GRID_DAYS = MONTH_GRID_ROWS * DAYS_IN_WEEK;

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (year: number, month: number, day: number) =>
  `${year}-${pad(month)}-${pad(day)}`;

function parts(date: Ymd) {
  const match = YMD.exec(date);
  if (!match) throw new RangeError(`Not a YYYY-MM-DD date: ${date}`);
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

/** Day 0 of the next month is the last day of this one. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The same day of the month `months` later, clamped to the shorter month. */
export function addMonths(date: Ymd, months: number): Ymd {
  const { year, month, day } = parts(date);
  const absolute = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(absolute / 12);
  const targetMonth = (absolute % 12) + 1;
  return ymd(
    targetYear,
    targetMonth,
    Math.min(day, daysInMonth(targetYear, targetMonth)),
  );
}

export function monthStart(date: Ymd): Ymd {
  const { year, month } = parts(date);
  return ymd(year, month, 1);
}

export function monthEnd(date: Ymd): Ymd {
  const { year, month } = parts(date);
  return ymd(year, month, daysInMonth(year, month));
}

/** `count` consecutive dates from `from`. */
export function dateSequence(from: Ymd, count: number): Ymd[] {
  return Array.from({ length: count }, (_, offset) => addDays(from, offset));
}

export type WeekRange = { start: Ymd; end: Ymd; days: Ymd[] };

/** The Monday-to-Sunday week containing `date`. */
export function weekRange(date: Ymd): WeekRange {
  const start = addDays(date, -dayOfWeek(date));
  return {
    start,
    end: addDays(start, DAYS_IN_WEEK - 1),
    days: dateSequence(start, DAYS_IN_WEEK),
  };
}

export type MonthRange = {
  start: Ymd;
  end: Ymd;
  /** Monday of the row the first of the month falls in. */
  gridStart: Ymd;
  gridEnd: Ymd;
  days: Ymd[];
};

/** The month containing `date`, plus the leading and trailing days of its grid. */
export function monthRange(date: Ymd): MonthRange {
  const start = monthStart(date);
  const gridStart = addDays(start, -dayOfWeek(start));
  return {
    start,
    end: monthEnd(date),
    gridStart,
    gridEnd: addDays(gridStart, MONTH_GRID_DAYS - 1),
    days: dateSequence(gridStart, MONTH_GRID_DAYS),
  };
}

/** What to fetch: a first date and a day count, straight into readNextWorkouts. */
export function visibleRange(
  view: CalendarView,
  date: Ymd,
): { from: Ymd; days: number } {
  switch (view) {
    case "week":
      return { from: weekRange(date).start, days: DAYS_IN_WEEK };
    case "month":
      return { from: monthRange(date).gridStart, days: MONTH_GRID_DAYS };
    case "day":
      return { from: date, days: 1 };
  }
}

/**
 * Previous (`-1`) or next (`+1`). A month step lands on the first of the month,
 * so paging back and forth cannot drift off the end of a short month.
 */
export function step(view: CalendarView, date: Ymd, delta: number): Ymd {
  switch (view) {
    case "week":
      return addDays(date, delta * DAYS_IN_WEEK);
    case "month":
      return addMonths(monthStart(date), delta);
    case "day":
      return addDays(date, delta);
  }
}
