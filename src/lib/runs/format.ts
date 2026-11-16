/**
 * Labels a run needs that the calendar's formatters do not already give.
 *
 * `src/lib/calendar/format.ts` formats a plain 'YYYY-MM-DD' date. A run is
 * stored as a `timestamptz`, so two things are needed here: the Paris calendar
 * date of an instant, which `parisDate` already does, and the Paris clock time
 * of one, which nothing did.
 *
 * `parisClock` sits here rather than in src/lib/plan/dates.ts on purpose: a
 * time of day is not a plan concept. The plan is made of dates, and a session
 * has no hour.
 */

import { fmtPace, fmtTime } from "@/lib/plan";

const PARIS = "Europe/Paris";

const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: PARIS,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * '07:30', the wall-clock time in Paris for an instant.
 *
 * Only ever called for a run whose `start_time_known` is true. A run without
 * an entered time is stored at midday Paris, and showing "12:00" would be
 * inventing a fact the athlete never gave.
 */
export function parisClock(instant: Date): string {
  return clockFormatter.format(instant);
}

/** '5:00 /km'. */
export function formatPacePerKm(secPerKm: number): string {
  return `${fmtPace(secPerKm)} /km`;
}

/** '50:00', or '1:23:45' past the hour. */
export function formatDuration(seconds: number): string {
  return fmtTime(seconds);
}

/** '148 bpm'. The source is said separately, because it is never mixed in. */
export function formatHr(bpm: number): string {
  return `${bpm} bpm`;
}
