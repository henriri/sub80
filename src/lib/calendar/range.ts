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

/** The last date a view renders, which is where the visible range ends. */
export function visibleEnd(view: CalendarView, date: Ymd): Ymd {
  const { from, days } = visibleRange(view, date);
  return addDays(from, days - 1);
}

/**
 * How many days to load either side of the visible range.
 *
 * One, so a session dropped on the first or last visible day can see the
 * neighbour it would end up next to. Without it the consecutive-key warning
 * arrives from the server *after* the drop, with the card already apparently
 * landed, instead of appearing under the finger before it.
 */
export const EDGE_PADDING_DAYS = 1;

/**
 * What to FETCH, as against what to render: the visible range plus a day
 * either side.
 *
 * Only for the week and the month. A day view renders one day, which is also
 * its only drop target, so a drag within it can only ever be refused as
 * `same_date` -- there is no neighbour to warn about and nothing to load.
 *
 * The padding days are move CANDIDATES and nothing else. They cannot reach a
 * total or the grid, because `buildCalendarView` reads only the dates it
 * renders. They cannot reach the 60 km or five-runs checks either, and that
 * is a property of the arithmetic rather than a filter: `validateMove` sums
 * by `weekIndexOf`, a week view's padding is the previous Sunday and the next
 * Monday, and a month grid is six whole Monday-to-Sunday weeks -- so in both
 * views a padding day is always in a week the view does not render, and never
 * in the destination week of any drop the view can make.
 */
export function fetchRange(
  view: CalendarView,
  date: Ymd,
): { from: Ymd; days: number } {
  const { from, days } = visibleRange(view, date);
  if (view === "day") return { from, days };

  return {
    from: addDays(from, -EDGE_PADDING_DAYS),
    days: days + EDGE_PADDING_DAYS * 2,
  };
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
