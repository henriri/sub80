/**
 * Which of a run's fields the athlete may edit. Pure and framework free.
 *
 * A run entered by hand is entirely theirs. A run a device recorded is not: its
 * distance, duration, date and heart rate are the file's record of what
 * happened, and typing over them loses the only copy. So for any source but
 * `manual` those fields are fixed, while `rpe`, `notes` and the linked session
 * stay editable -- how hard it felt is not in the file, and which session a run
 * belongs to is a judgement nothing but the athlete can make.
 *
 * The same rule is enforced in SQL by `update_run`
 * (20261117190000_update_run_source_guard.sql). This is the copy the form uses
 * to render those fields read-only and the Server Action re-runs against the
 * freshly read row, so the form, the action and the database agree about what
 * is refused and why -- the pattern `validateRun` already follows for the
 * training bounds.
 *
 * Comparison is field by field rather than a flat refusal, because a form
 * re-sends every field on every submit: changing only the note of an imported
 * run posts its distance back unchanged, and that has to succeed. `update_run`
 * compares with IS NOT DISTINCT FROM for the same reason.
 */

import type { ParsedRun, RunSource } from "./rules";

/** Whether this run's measurements are the device's rather than the athlete's. */
export function isStatsLocked(source: RunSource): boolean {
  return source !== "manual";
}

/** What the rule compares against: a run as it is stored. */
export type StoredStats = {
  /** The Paris calendar date of the run, derived from the stored instant. */
  date: string;
  /** 'HH:MM', or null when no start time was recorded. Never invented. */
  time: string | null;
  distanceM: number;
  durationS: number;
  avgHr: number | null;
  hrSource: string | null;
};

/** What the form submitted, as `validateRun` parsed it. */
type SubmittedStats = Pick<
  ParsedRun,
  "date" | "time" | "distanceM" | "durationS" | "avgHr" | "hrSource"
>;

/**
 * Whether the submission would change any measurement.
 *
 * False for an unchanged resend, which is what makes editing the note of an
 * imported run possible at all.
 */
export function statsChanged(
  submitted: SubmittedStats,
  stored: StoredStats,
): boolean {
  return (
    submitted.date !== stored.date ||
    submitted.time !== stored.time ||
    submitted.distanceM !== stored.distanceM ||
    submitted.durationS !== stored.durationS ||
    submitted.avgHr !== stored.avgHr ||
    submitted.hrSource !== stored.hrSource
  );
}

/**
 * Whether this edit must be refused: an imported run whose measurements the
 * submission would change.
 */
export function refusesStatsEdit(
  source: RunSource,
  submitted: SubmittedStats,
  stored: StoredStats,
): boolean {
  return isStatsLocked(source) && statsChanged(submitted, stored);
}
