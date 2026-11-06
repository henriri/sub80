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
  type StoredWorkout,
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
import type { CalendarView } from "./params";
import { monthRange, weekRange } from "./range";

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

export type CalendarViewModel = WeekViewModel | MonthViewModel | DayViewModel;

export type ViewInput = {
  date: Ymd;
  today: Ymd;
  workouts: readonly StoredWorkout[];
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

function toItem(workout: StoredWorkout, vdot: number): CalendarItem {
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
    daySlot: workout.day_slot,
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
  workouts: readonly StoredWorkout[],
  vdot: number,
): Map<Ymd, CalendarItem[]> {
  const byDate = new Map<Ymd, CalendarItem[]>();

  for (const workout of workouts) {
    const items = byDate.get(workout.planned_date) ?? [];
    items.push(toItem(workout, vdot));
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
 * A day cell's accessible name: the whole date, then what is planned on it.
 * The visible cell shows a bare day number and a marker or two, which on its
 * own tells a screen-reader user almost nothing.
 */
export function describeDay(day: CalendarDay): string {
  if (day.items.length === 0) {
    return day.inPlan
      ? `${day.fullLabel}, nothing planned`
      : `${day.fullLabel}, outside the plan`;
  }

  const kinds = day.items.map((item) => KIND_META[item.kind].label).join(", ");
  return `${day.fullLabel}, ${kinds}, ${formatKm(day.metres)}`;
}

export function buildWeekView({ date, today, workouts, vdot }: ViewInput): WeekViewModel {
  const { start, end, days } = weekRange(date);
  const byDate = itemsByDate(workouts, vdot);
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
  const byDate = itemsByDate(workouts, vdot);

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
  const byDate = itemsByDate(workouts, vdot);
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
  view: CalendarView,
  input: ViewInput,
): CalendarViewModel {
  switch (view) {
    case "week":
      return buildWeekView(input);
    case "month":
      return buildMonthView(input);
    case "day":
      return buildDayView(input);
  }
}
