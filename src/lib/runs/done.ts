/**
 * What a finished session says on a calendar card. Pure and framework free.
 *
 * A session is completed if and only if a run is linked to it, so a card has to
 * read the runs rather than the status column. This turns them into the handful
 * of labels a card has room for, and nothing more: no zone, no verdict, no
 * in-zone or too-slow judgement. The card states what happened and what was
 * asked for, and the athlete reads the difference.
 *
 * Two runs on one session is legitimate -- the log form warns and the athlete
 * confirms -- so distance and time are SUMMED. The heart rate and the effort
 * are not: a strap reading and a wrist reading are never mixed or averaged, and
 * two efforts scored separately have no meaningful mean. With more than one run
 * they are simply left off, and the session's own page lists each run in full.
 */

import { formatKmValue } from "@/lib/calendar";
import { formatDuration, formatHr, formatPacePerKm } from "./format";
import { hrSourceLabel, rpeLabel } from "./messages";
import { paceSecPerKm } from "./parse";
import type { HrSource } from "./rules";

/** The numbers a card needs about one run. A structural subset of the row. */
export type DoneRun = {
  distance_m: number;
  duration_s: number;
  avg_hr: number | null;
  hr_source: HrSource | null;
  rpe: number | null;
};

/** What happened on a session, ready to render. */
export type DoneFacts = {
  /** How many runs are linked. One is the usual case; two is legitimate. */
  runs: number;
  /** The distance actually run, summed. */
  metres: number;
  distanceLabel: string;
  timeLabel: string;
  paceLabel: string;
  /** '148 bpm', or null. Never shown without its source, never averaged. */
  hrLabel: string | null;
  hrSourceLabel: string | null;
  /** '4 · moderate', or null when no effort was scored. */
  rpeLabel: string | null;
};

/**
 * What happened, or null when nothing did.
 *
 * Null rather than an empty summary, because "no run" is the state the card
 * shows a plan for: there is nothing to report, not a report of nothing.
 */
export function doneFacts(runs: readonly DoneRun[]): DoneFacts | null {
  if (runs.length === 0) return null;

  const metres = runs.reduce((total, run) => total + run.distance_m, 0);
  const seconds = runs.reduce((total, run) => total + run.duration_s, 0);
  // Only one run can speak for the heart rate and the effort. See the header.
  const only = runs.length === 1 ? runs[0] : undefined;

  return {
    runs: runs.length,
    metres,
    distanceLabel: `${formatKmValue(metres)} km`,
    timeLabel: formatDuration(seconds),
    paceLabel: formatPacePerKm(paceSecPerKm(metres, seconds)),
    hrLabel: only?.avg_hr == null ? null : formatHr(only.avg_hr),
    hrSourceLabel: only?.hr_source == null ? null : hrSourceLabel(only.hr_source),
    rpeLabel: only?.rpe == null ? null : rpeLabel(only.rpe),
  };
}

/**
 * '8.2 / 8.0 km': what was run over what was asked for.
 *
 * One unit for the pair, because both numbers are kilometres and saying so
 * twice reads as two separate facts. Without a planned distance there is
 * nothing to compare against, so it is the actual distance alone.
 */
export function actualOverPlanned(metres: number, plannedM: number | null): string {
  if (plannedM === null) return `${formatKmValue(metres)} km`;
  return `${formatKmValue(metres)} / ${formatKmValue(plannedM)} km`;
}
