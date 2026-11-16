/**
 * Everything the run list and the run detail render, derived here so the
 * components stay thin and this stays testable. No framework imports.
 *
 * Two things are deliberately NOT recomputed from today's fitness. A run's
 * zone line uses `vdot_used` and `planned_pace_zone` -- the snapshots taken
 * when it was linked -- because a run from a year ago was aimed at the paces of
 * its own day. The calendar does the opposite for a *planned* session, which is
 * right for the opposite reason: a session still to come should be read at the
 * fitness the athlete has now.
 */

import { formatFullDate, formatKm } from "@/lib/calendar";
import { parisDate, formatDayLabel, type Ymd } from "@/lib/plan";
import { formatDuration, formatHr, formatPacePerKm, parisClock } from "./format";
import { hrSourceLabel, paceVsZoneLine, rpeLabel } from "./messages";
import { paceSecPerKm } from "./parse";
import type { RawRun } from "./rules";
import type { StoredRun } from "./schemas";
import { paceVsZone } from "./zone";

/** How many runs a page of the list shows. */
export const RUNS_PER_PAGE = 20;

/** How much of a note a row shows before it is cut. */
export const NOTES_EXCERPT_LENGTH = 80;

/** One run, ready to render. */
export type RunRow = {
  /** The activities row id. */
  id: string;
  href: string;
  /** The Paris calendar date of the run, derived from the stored instant. */
  date: Ymd;
  /** 'Sat 20 Nov'. */
  dateLabel: string;
  /** 'Saturday 20 November 2027', for an accessible name. */
  fullDateLabel: string;
  /** '07:30', or null when no start time was entered. Never invented. */
  startTimeLabel: string | null;
  /** '10.0 km'. */
  distanceLabel: string;
  /** '50:00'. */
  timeLabel: string;
  /** '5:00 /km'. */
  paceLabel: string;
  /** '4 · moderate', or null when no effort was scored. */
  rpeLabel: string | null;
  /** '148 bpm', or null. Shown beside `hrSourceLabel`, never merged with it. */
  hrLabel: string | null;
  /** 'chest strap' or 'wrist'. Null exactly when `hrLabel` is. */
  hrSourceLabel: string | null;
  /** The note, cut to one line. */
  notesExcerpt: string | null;
  /** The linked session's title, or null when the run stands alone. */
  workoutTitle: string | null;
  workoutHref: string | null;
  /** The factual pace line, when the run was linked and a zone was snapshotted. */
  zoneLine: string | null;
};

export type RunListModel = {
  runs: readonly RunRow[];
  /** 1-based, as the URL carries it. */
  page: number;
  hasPrev: boolean;
  hasNext: boolean;
};

/** Cut to one line, on a word boundary where there is one. */
export function excerpt(notes: string, max = NOTES_EXCERPT_LENGTH): string {
  const text = notes.trim().replace(/\s+/g, " ");
  if (text.length <= max) return text;

  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  // Only break on a word if that leaves most of the line; otherwise a very
  // long first word would be cut to almost nothing.
  const kept = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${kept.trimEnd()}…`;
}

/** One stored row as a row of the list. */
export function toRunRow(run: StoredRun): RunRow {
  const instant = new Date(run.started_at);
  const date = parisDate(instant);
  const pace = paceSecPerKm(run.distance_m, run.duration_s);

  // Both snapshots, or no line. A zone without the VDOT it was read at cannot
  // be turned back into a pace window, so there is nothing factual to say.
  const zone = run.planned_pace_zone;
  const vdot = run.vdot_used;
  const zoneLine =
    zone !== null && vdot !== null ? paceVsZoneLine(paceVsZone(pace, zone, vdot), zone) : null;

  return {
    id: run.id,
    href: `/runs/${run.id}`,
    date,
    dateLabel: formatDayLabel(date),
    fullDateLabel: formatFullDate(date),
    startTimeLabel: run.start_time_known ? parisClock(instant) : null,
    distanceLabel: formatKm(run.distance_m),
    timeLabel: formatDuration(run.duration_s),
    paceLabel: formatPacePerKm(pace),
    rpeLabel: run.rpe === null ? null : rpeLabel(run.rpe),
    hrLabel: run.avg_hr === null ? null : formatHr(run.avg_hr),
    hrSourceLabel: run.hr_source === null ? null : hrSourceLabel(run.hr_source),
    notesExcerpt: run.notes === null ? null : excerpt(run.notes),
    workoutTitle: run.planned_workout?.title ?? null,
    workoutHref:
      run.planned_workout_id === null ? null : `/workouts/${run.planned_workout_id}`,
    zoneLine,
  };
}

/**
 * A page of the run list.
 *
 * `rows` may hold one more run than a page shows: the data layer asks for
 * RUNS_PER_PAGE + 1 so that "is there a next page" is answered by the read
 * itself rather than by a second count query. The extra row is dropped here.
 */
export function buildRunList({
  rows,
  page,
}: {
  rows: readonly StoredRun[];
  page: number;
}): RunListModel {
  return {
    runs: rows.slice(0, RUNS_PER_PAGE).map(toRunRow),
    page,
    hasPrev: page > 1,
    hasNext: rows.length > RUNS_PER_PAGE,
  };
}

/**
 * The page number from the URL, clamped to something real.
 *
 * Anything that is not a whole page number -- missing, zero, negative, a word,
 * a float -- is page 1. Unlike the calendar's view and date, a bad page needs
 * no redirect: there is exactly one sensible reading of "show me the runs",
 * and the first page is it.
 */
export function parseRunsPage(raw: string | string[] | undefined): number {
  const value = typeof raw === "string" ? raw : undefined;
  if (value === undefined || !/^\d+$/.test(value)) return 1;

  const page = Number(value);
  return page < 1 ? 1 : page;
}

/** '/runs', or '/runs?page=3'. Page 1 has no query, so the URL stays clean. */
export function runsHref(page: number): string {
  return page <= 1 ? "/runs" : `/runs?page=${page}`;
}

/**
 * A stored run as the form's fields, for editing.
 *
 * The inverse of what `validateRun` does on the way in, and tested as a round
 * trip: parsing these strings again has to give back the same numbers, or
 * opening a run and saving it unchanged would quietly alter it.
 *
 * The duration is printed as 'm:ss' or 'h:mm:ss' rather than as bare minutes,
 * because bare minutes would need a decimal for anything that is not a whole
 * minute and `parseDur` rounds a decimal to the nearest second.
 */
export function toRawRun(run: StoredRun): RawRun {
  const instant = new Date(run.started_at);

  return {
    date: parisDate(instant),
    time: run.start_time_known ? parisClock(instant) : "",
    distanceKm: String(run.distance_m / 1000),
    duration: formatDuration(run.duration_s),
    avgHr: run.avg_hr === null ? "" : String(run.avg_hr),
    hrSource: run.hr_source ?? "",
    rpe: run.rpe === null ? "" : String(run.rpe),
    notes: run.notes ?? "",
    plannedWorkoutId: run.planned_workout_id,
  };
}
