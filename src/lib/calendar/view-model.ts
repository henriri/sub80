/**
 * Everything the calendar components render, derived here so they stay thin
 * and this stays testable. Nothing in this file imports a framework.
 *
 * Paces are never stored: each item's pace label is computed from the
 * athlete's current VDOT at build time, which is why `vdot` is an input.
 */

import {
  MAX_WEEK,
  buildWeek,
  dayOfWeek,
  paceRangeLabel,
  weekIndexOf,
  type StoredWorkoutWithRuns,
  type WorkoutRun,
  type WorkoutKind,
  type WorkoutStatus,
  type Ymd,
  type ZoneKey,
} from "@/lib/plan";
import {
  formatDateRange,
  formatFullDate,
  formatKm,
  formatMonthTitle,
  formatWeekdayShort,
} from "./format";
import { KIND_META, isEventKind } from "./kinds";
import { monthGrid, type MonthCell } from "./month-grid";
import { workoutHref, type CalendarParams, type CalendarView } from "./params";
import { monthRange, weekRange } from "./range";
import type { YearViewModel } from "./year-view";

/** One planned session, ready to render. */
export type CalendarItem = {
  /** The planned_workouts row id. Stable: drag and drop will key on it. */
  id: string;
  title: string;
  kind: WorkoutKind;
  metres: number | null;
  paceZone: ZoneKey | null;
  /** '4:48–5:36 /km' at the athlete's current VDOT, or null without a zone. */
  paceLabel: string | null;
  strides: boolean;
  isKey: boolean;
  /** Only a planned workout may be moved. */
  status: WorkoutStatus;
  /**
   * The runs logged against it, newest first.
   *
   * A session is completed if and only if one of these exists, so this is what
   * says whether the day is done -- not `status`, which is a consequence of
   * logging and can be stale on a legacy row. Empty is the usual case for a
   * session still to come.
   *
   * The rows are carried rather than summarised here because the summary needs
   * the run formatters, and `src/lib/runs` already imports this module: turning
   * that around would make a cycle. `doneFacts` does the summarising on the
   * other side of that line.
   */
  runs: readonly WorkoutRun[];
  /**
   * This workout's own page, carrying the view and date it was opened from so
   * the back link returns to the calendar the athlete was looking at.
   *
   * Computed here rather than in the card, because the model is the only place
   * that knows both the view and the date, and because a pure function of the
   * input is testable where a context read is not.
   */
  href: string;
  /** Order within the day: 0 first, 1 second. */
  daySlot: 0 | 1;
};

export type CalendarDay = {
  date: Ymd;
  /** 0 = Monday … 6 = Sunday. */
  dow: number;
  /** 'Mon'. */
  weekdayLabel: string;
  /** 'Monday 15 March 2027', for the cell's accessible name. */
  fullLabel: string;
  isToday: boolean;
  /** Inside the 78 plan weeks. */
  inPlan: boolean;
  /** A race or a time trial falls on this day. */
  isEvent: boolean;
  items: CalendarItem[];
  /** The day's planned distance. */
  metres: number;
};

export type MonthDay = CalendarDay & Pick<MonthCell, "dayOfMonth" | "inMonth">;

export type WeekViewModel = {
  view: "week";
  date: Ymd;
  start: Ymd;
  end: Ymd;
  weekIndex: number | null;
  /** 'Week 13 · Aerobic base · Build week', or 'Outside the plan'. */
  title: string;
  /** '19 – 25 Oct 2026'. */
  rangeLabel: string;
  /** Seven days, Monday first. */
  days: CalendarDay[];
  metres: number;
  /** The week's planned volume in km, or null outside the plan. */
  plannedKm: number | null;
};

export type MonthViewModel = {
  view: "month";
  date: Ymd;
  start: Ymd;
  /** 'March 2027'. */
  title: string;
  /** Six rows of seven. */
  weeks: MonthDay[][];
};

export type DayViewModel = {
  view: "day";
  date: Ymd;
  /** 'Monday 15 March 2027'. */
  title: string;
  weekIndex: number | null;
  /** The week this day belongs to, or null outside the plan. */
  subtitle: string | null;
  day: CalendarDay;
};

/**
 * The year is in the union, so one `Calendar` renders any tab -- but it is not
 * in `buildCalendarView` below, because it is built from twelve totals rather
 * than from sessions and has no use for a `ViewInput`. `buildYearView` is its
 * own entry point and the parameter type here says so.
 */
export type SessionViewModel = WeekViewModel | MonthViewModel | DayViewModel;

export type CalendarViewModel = SessionViewModel | YearViewModel;

/** Every view except the year, which `buildCalendarView` cannot build. */
export type SessionView = Exclude<CalendarView, "year">;

export type ViewInput = {
  date: Ymd;
  today: Ymd;
  workouts: readonly StoredWorkoutWithRuns[];
  /** The athlete's current VDOT: every pace shown is derived from it. */
  vdot: number;
};

export const OUTSIDE_PLAN = "Outside the plan";

/** Whether a week index falls inside the plan. `weekIndexOf` is unbounded. */
export function isPlanWeek(weekIndex: number): boolean {
  return Number.isInteger(weekIndex) && weekIndex >= 1 && weekIndex <= MAX_WEEK;
}

/** 'Week 13 · Aerobic base · Build week', or null outside the plan. */
export function weekTitle(weekIndex: number): string | null {
  if (!isPlanWeek(weekIndex)) return null;
  const week = buildWeek(weekIndex);
  return `Week ${week.i} · ${week.phase.name} · ${week.label}`;
}

/** The week's planned volume in km, or null outside the plan. */
export function plannedKmFor(weekIndex: number): number | null {
  return isPlanWeek(weekIndex) ? buildWeek(weekIndex).km : null;
}

export function sumMetres(items: readonly { metres: number | null }[]): number {
  return items.reduce((total, item) => total + (item.metres ?? 0), 0);
}

function toItem(
  workout: StoredWorkoutWithRuns,
  vdot: number,
  back: CalendarParams,
): CalendarItem {
  return {
    id: workout.id,
    title: workout.title,
    kind: workout.kind,
    metres: workout.target_distance_m,
    paceZone: workout.pace_zone,
    paceLabel: workout.pace_zone ? paceRangeLabel(workout.pace_zone, vdot) : null,
    strides: workout.strides,
    isKey: workout.is_key,
    status: workout.status,
    runs: workout.runs,
    daySlot: workout.day_slot,
    href: workoutHref(workout.id, back),
  };
}

/**
 * Same-day order: `day_slot`, the stored order a move writes, so dragging a
 * session into the second slot of a day keeps it there.
 *
 * Key-session-first and then title remain as tie-breaks. They are unreachable
 * while the slots are distinct, which a day of at most two workouts
 * guarantees; they are kept so that data breaking that invariant still renders
 * in a stable order rather than reshuffling between renders.
 *
 * Exported because the optimistic reducer re-sorts a day it has just changed,
 * and a second comparator there could put a moved card in a different place
 * than the server's own read will.
 */
export function compareCalendarItems(a: CalendarItem, b: CalendarItem): number {
  return (
    a.daySlot - b.daySlot ||
    Number(b.isKey) - Number(a.isKey) ||
    a.title.localeCompare(b.title)
  );
}

/** Rows by date, each day's items in render order. */
function itemsByDate(
  workouts: readonly StoredWorkoutWithRuns[],
  vdot: number,
  back: CalendarParams,
): Map<Ymd, CalendarItem[]> {
  const byDate = new Map<Ymd, CalendarItem[]>();

  for (const workout of workouts) {
    const items = byDate.get(workout.planned_date) ?? [];
    items.push(toItem(workout, vdot, back));
    byDate.set(workout.planned_date, items);
  }

  for (const items of byDate.values()) items.sort(compareCalendarItems);

  return byDate;
}

function toDay(date: Ymd, today: Ymd, items: CalendarItem[]): CalendarDay {
  return {
    date,
    dow: dayOfWeek(date),
    weekdayLabel: formatWeekdayShort(date),
    fullLabel: formatFullDate(date),
    isToday: date === today,
    inPlan: isPlanWeek(weekIndexOf(date)),
    isEvent: items.some((item) => isEventKind(item.kind)),
    items,
    metres: sumMetres(items),
  };
}

/**
 * Whether a session happened: a run is linked to it.
 *
 * The one definition the components share, so a card, a month marker and a day
 * label cannot come to different conclusions -- and so none of them reads
 * `status`, which is a consequence of logging rather than the fact.
 */
export function isSessionDone(item: Pick<CalendarItem, "runs">): boolean {
  return item.runs.length > 0;
}

/**
 * A day cell's accessible name: the whole date, then what is planned on it,
 * then whether it happened. The visible cell shows a bare day number and a
 * marker or two, which on its own tells a screen-reader user almost nothing --
 * and the filled marker that says "done" is exactly the kind of cue that has
 * to be said in words as well.
 */
export function describeDay(day: CalendarDay): string {
  if (day.items.length === 0) {
    return day.inPlan
      ? `${day.fullLabel}, nothing planned`
      : `${day.fullLabel}, outside the plan`;
  }

  const kinds = day.items.map((item) => KIND_META[item.kind].label).join(", ");
  const done = day.items.filter(isSessionDone).length;
  const outcome =
    done === 0
      ? ""
      : done === day.items.length
        ? ", done"
        : `, ${done} of ${day.items.length} done`;

  return `${day.fullLabel}, ${kinds}, ${formatKm(day.metres)}${outcome}`;
}

export function buildWeekView({ date, today, workouts, vdot }: ViewInput): WeekViewModel {
  const { start, end, days } = weekRange(date);
  const byDate = itemsByDate(workouts, vdot, { view: "week", date });
  const weekIndex = weekIndexOf(start);
  const inPlan = isPlanWeek(weekIndex);
  const built = days.map((day) => toDay(day, today, byDate.get(day) ?? []));

  return {
    view: "week",
    date,
    start,
    end,
    weekIndex: inPlan ? weekIndex : null,
    title: weekTitle(weekIndex) ?? OUTSIDE_PLAN,
    rangeLabel: formatDateRange(start, end),
    days: built,
    metres: sumMetres(built.flatMap((day) => day.items)),
    plannedKm: plannedKmFor(weekIndex),
  };
}

export function buildMonthView({
  date,
  today,
  workouts,
  vdot,
}: ViewInput): MonthViewModel {
  const byDate = itemsByDate(workouts, vdot, { view: "month", date });

  return {
    view: "month",
    date,
    start: monthRange(date).start,
    // The grid is Monday-first, so the title comes from the month, not the grid.
    title: formatMonthTitle(date),
    weeks: monthGrid(date).map((row) =>
      row.map((cell) => ({
        ...toDay(cell.date, today, byDate.get(cell.date) ?? []),
        dayOfMonth: cell.dayOfMonth,
        inMonth: cell.inMonth,
      })),
    ),
  };
}

export function buildDayView({ date, today, workouts, vdot }: ViewInput): DayViewModel {
  const byDate = itemsByDate(workouts, vdot, { view: "day", date });
  const weekIndex = weekIndexOf(date);
  const inPlan = isPlanWeek(weekIndex);

  return {
    view: "day",
    date,
    title: formatFullDate(date),
    weekIndex: inPlan ? weekIndex : null,
    subtitle: weekTitle(weekIndex),
    day: toDay(date, today, byDate.get(date) ?? []),
  };
}

export function buildCalendarView(
  view: SessionView,
  input: ViewInput,
): SessionViewModel {
  switch (view) {
    case "week":
      return buildWeekView(input);
    case "month":
      return buildMonthView(input);
    case "day":
      return buildDayView(input);
  }
}
