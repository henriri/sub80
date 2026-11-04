/**
 * Labels the calendar needs that `src/lib/plan/dates` does not already give:
 * month titles, weekday headings, a full accessible date and distances.
 *
 * Each date is formatted at midday UTC, the same trick `formatDayLabel` uses:
 * midday is far from any zone boundary, so the parts Intl hands back are the
 * calendar date asked for and never the day either side of it.
 */

import type { Ymd } from "@/lib/plan";

const PARIS = "Europe/Paris";
const YMD = /^\d{4}-\d{2}-\d{2}$/;

function middayUtc(date: Ymd): Date {
  if (!YMD.test(date)) throw new RangeError(`Not a YYYY-MM-DD date: ${date}`);
  return new Date(`${date}T12:00:00Z`);
}

const monthTitleFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: PARIS,
  month: "long",
  year: "numeric",
});

/** 'March 2027', the month view's title. */
export function formatMonthTitle(date: Ymd): string {
  return monthTitleFormatter.format(middayUtc(date));
}

const weekdayFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: PARIS,
  weekday: "short",
});

/** 'Mon', for a column heading. */
export function formatWeekdayShort(date: Ymd): string {
  return weekdayFormatter.format(middayUtc(date));
}

const fullDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: PARIS,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** 'Monday 15 March 2027': the accessible name of a day cell, and the day title. */
export function formatFullDate(date: Ymd): string {
  return fullDateFormatter.format(middayUtc(date)).replace(",", "");
}

const rangeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: PARIS,
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** '19 – 25 Oct 2026', and '27 Dec 2027 – 2 Jan 2028' across a year. */
export function formatDateRange(from: Ymd, to: Ymd): string {
  return rangeFormatter.formatRange(middayUtc(from), middayUtc(to));
}

/** '12.5', the bare number for a tight month cell. */
export function formatKmValue(metres: number): string {
  return (metres / 1000).toFixed(1);
}

/** '12.5 km'. */
export function formatKm(metres: number): string {
  return `${formatKmValue(metres)} km`;
}
