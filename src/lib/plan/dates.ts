/**
 * The plan calendar. Dates are plain 'YYYY-MM-DD' strings and all arithmetic
 * runs in UTC, so a daylight-saving change can never shift a day. Nothing here
 * reads the machine's time zone or clock: `parisDate` takes the instant as an
 * argument, which keeps this module pure and testable.
 *
 * `dow` is 0 = Monday … 6 = Sunday, so a session on dow 6 of week 78 is the
 * race on a Sunday.
 */

/** A calendar date as 'YYYY-MM-DD'. */
export type Ymd = string;

/** First Monday of the plan. */
export const PLAN_START: Ymd = "2026-10-19";
/** Half marathon, week 78, dow 6. */
export const RACE_DATE: Ymd = "2028-04-16";
export const MAX_WEEK = 78;
/** Running volume ceiling in km per week (pubalgia history). A safety limit. */
export const WEEKLY_CAP = 60;

const DAY_MS = 86_400_000;
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number) => String(n).padStart(2, "0");

/** Midnight UTC for a 'YYYY-MM-DD' date. */
function toUtc(date: Ymd): number {
  const match = YMD.exec(date);
  if (!match) throw new RangeError(`Not a YYYY-MM-DD date: ${date}`);
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

function fromUtc(ms: number): Ymd {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(date: Ymd, days: number): Ymd {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

export function diffDays(from: Ymd, to: Ymd): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** Monday of plan week `week` (1-based). */
export function weekStart(week: number): Ymd {
  return addDays(PLAN_START, (week - 1) * 7);
}

/** Plan week a date falls in. 0 or less before the plan starts. */
export function weekIndexOf(date: Ymd): number {
  return Math.floor(diffDays(PLAN_START, date) / 7) + 1;
}

/** 0 = Monday … 6 = Sunday, matching `Session.dow`. */
export function dayOfWeek(date: Ymd): number {
  return (new Date(toUtc(date)).getUTCDay() + 6) % 7;
}

function parts(formatter: Intl.DateTimeFormat, date: Ymd) {
  // Midday UTC: far from any zone boundary, so the parts are the calendar date.
  return formatter.formatToParts(new Date(toUtc(date) + DAY_MS / 2));
}

const PARIS = "Europe/Paris";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: PARIS,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today in Europe/Paris, for an instant the caller supplies. */
export function parisDate(now: Date): Ymd {
  let year = "";
  let month = "";
  let day = "";
  for (const part of dateFormatter.formatToParts(now)) {
    if (part.type === "year") year = part.value;
    else if (part.type === "month") month = part.value;
    else if (part.type === "day") day = part.value;
  }
  return `${year}-${month}-${day}`;
}

const dayLabelFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: PARIS,
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** 'Sun 16 Apr', for lists. */
export function formatDayLabel(date: Ymd): string {
  return parts(dayLabelFormatter, date)
    .map((part) => part.value)
    .join("")
    .replace(",", "");
}
