/**
 * Everything the year view renders, derived here so the components stay thin.
 * Nothing in this file imports a framework.
 *
 * Its own module rather than part of `view-model.ts`: a year is built from two
 * columns of totals, not from sessions, so it needs none of the pace, kind or
 * drag machinery the other three views share -- and `buildCalendarView` cannot
 * build it from a `ViewInput` at all.
 */

import { niceAxis, type Axis } from "./axis";
import { formatMonthName } from "./format";
import { calendarHref } from "./params";
import {
  focusNumbers,
  monthTotals,
  yearOf,
  type FocusNumbers,
  type PlannedMonthRow,
  type RunMonthRow,
} from "./year";
import type { Ymd } from "@/lib/plan";

/** One column of the chart. */
export type YearMonth = {
  /** 1 to 12. */
  month: number;
  /** 'J', the visible label. Decoration: the link carries the name. */
  initial: string;
  /** 'January'. */
  name: string;
  loggedKm: number;
  plannedKm: number;
  /**
   * Each bar's height as a percentage of the axis, 0 to 100, from the metres
   * rather than the rounded kilometres: the printed numbers are rounded, the
   * drawing should not be.
   */
  loggedPercent: number;
  plannedPercent: number;
  /**
   * Whether anything happened or was ever asked for. A month with neither
   * draws no bar at all, which is what an unstarted month looks like.
   */
  hasData: boolean;
  /** Only ever true in the year that contains today. */
  isCurrent: boolean;
  /** This month in the Month view. */
  href: string;
  /** The column's accessible name: the month, both numbers, and whether it is now. */
  label: string;
};

/** The month in progress, with its name. Null for any year but today's. */
export type YearFocus = FocusNumbers & { monthName: string };

export type YearViewModel = {
  view: "year";
  /** The date the URL carries, kept so the view switcher can hand it on. */
  date: Ymd;
  year: number;
  /** '2027'. */
  title: string;
  /** Whole kilometres: what the big number prints. */
  loggedKm: number;
  plannedKm: number;
  months: YearMonth[];
  axis: Axis;
  focus: YearFocus | null;
};

export type YearViewInput = {
  /**
   * The date the URL carries. The year is read from it rather than passed
   * beside it, so the model and the URL cannot disagree about which year this
   * is; the route has already clamped it to a year the plan reaches.
   */
  date: Ymd;
  /** Today in Europe/Paris, passed in exactly as the other views take it. */
  today: Ymd;
  planned: readonly PlannedMonthRow[];
  runs: readonly RunMonthRow[];
};

const pad = (month: number) => String(month).padStart(2, "0");

/** Two decimals: enough for a bar's height, short enough for the markup. */
const percent = (part: number, whole: number) =>
  whole <= 0 ? 0 : Math.round((part / whole) * 10_000) / 100;

function monthLabel(name: string, logged: number, planned: number, current: boolean) {
  const now = current ? ", this month" : "";
  if (logged === 0 && planned === 0) return `${name}, nothing planned or logged${now}`;
  return `${name}, ${logged} km logged of ${planned} km planned${now}`;
}

/**
 * The year, from its twelve totals.
 *
 * The axis is scaled to the largest single bar in either series, so the two
 * series share one scale and a tall planned month cannot make a logged month
 * look bigger than it was.
 */
export function buildYearView({
  date,
  today,
  planned,
  runs,
}: YearViewInput): YearViewModel {
  const year = yearOf(date);
  const totals = monthTotals(planned, runs, year);
  const isCurrentYear = yearOf(today) === year;
  const currentMonth = Number(today.slice(5, 7));

  const tallestKm = Math.max(
    ...totals.map((total) => Math.max(total.loggedM, total.plannedM) / 1000),
  );
  const axis = niceAxis(tallestKm);

  const months = totals.map((total): YearMonth => {
    const date = `${year}-${pad(total.month)}-01`;
    const name = formatMonthName(date);
    const loggedKm = Math.round(total.loggedM / 1000);
    const plannedKm = Math.round(total.plannedM / 1000);
    const isCurrent = isCurrentYear && total.month === currentMonth;

    return {
      month: total.month,
      initial: name.slice(0, 1),
      name,
      loggedKm,
      plannedKm,
      loggedPercent: percent(total.loggedM / 1000, axis.max),
      plannedPercent: percent(total.plannedM / 1000, axis.max),
      hasData: total.loggedM > 0 || total.plannedM > 0,
      isCurrent,
      href: calendarHref({ view: "month", date }),
      label: monthLabel(name, loggedKm, plannedKm, isCurrent),
    };
  });

  const current = isCurrentYear ? totals[currentMonth - 1] : undefined;

  return {
    view: "year",
    date,
    year,
    title: String(year),
    loggedKm: Math.round(
      totals.reduce((sum, total) => sum + total.loggedM, 0) / 1000,
    ),
    plannedKm: Math.round(
      totals.reduce((sum, total) => sum + total.plannedM, 0) / 1000,
    ),
    months,
    axis,
    focus:
      current === undefined
        ? null
        : {
            ...focusNumbers(current.loggedM, current.plannedM),
            monthName: formatMonthName(`${year}-${pad(current.month)}-01`),
          },
  };
}
