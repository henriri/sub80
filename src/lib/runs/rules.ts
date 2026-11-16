/**
 * The rules for a run entered by hand. Pure and framework free: `validateRun`
 * is the single definition both the form (for instant feedback) and the Server
 * Action (authoritative) call, so a run the form accepts is one the server
 * accepts for the same reason.
 *
 * Nothing here reads a clock. `today` is an argument, like `parisDate(now)`,
 * which is also why the daylight-saving cases can be tested on 2027 dates that
 * the database functions would refuse as being in the future.
 *
 * Reasons and warnings carry data, never a sentence: the wording lives in
 * ./messages.ts, as the move rules keep theirs in src/lib/calendar.
 *
 * The split with the database is the same one validateMove has with
 * move_planned_workout. SQL enforces what keeps the row coherent -- ownership,
 * a date that is not in the future, a heart rate paired with its source, the
 * two snapshots. The training-domain bounds below are enforced here only,
 * because they need the same units and rounding as the sentence the athlete
 * reads and a PL/pgSQL twin would be a second definition free to drift.
 */

import { isValidYmd } from "@/lib/calendar";
import {
  MAX_NOTES_LENGTH,
  diffDays,
  normaliseNotes,
  notesTooLong,
  type Ymd,
} from "@/lib/plan";
import {
  isBlank,
  kmToMetres,
  paceSecPerKm,
  parseClock,
  parseDur,
  parseKm,
  parseWhole,
} from "./parse";

/** Where a heart rate came from. Never mixed, never averaged. */
export const HR_SOURCES = ["strap", "wrist"] as const;
export type HrSource = (typeof HR_SOURCES)[number];

/**
 * How an activity reached the database. Only 'manual' is written today; the
 * other three are the import paths the column exists to keep apart, and they
 * are listed here so a stored row can be validated against a closed set.
 */
export const RUN_SOURCES = ["manual", "fit_upload", "polar", "wahoo"] as const;
export type RunSource = (typeof RUN_SOURCES)[number];

/** Faster than this is not a run anyone has recorded. 2:00 /km. */
export const MIN_PACE_S = 120;
/** Slower than this is a walk, or a stopped watch. 20:00 /km. */
export const MAX_PACE_S = 1200;
/** Outside this window the run is accepted, but only after confirmation. */
export const WARN_FAST_PACE_S = 180;
export const WARN_SLOW_PACE_S = 510;

export const MIN_DISTANCE_M = 100;
export const MAX_DISTANCE_M = 100_000;
export const MIN_DURATION_S = 60;
export const MAX_DURATION_S = 12 * 3600;

export const MIN_RPE = 1;
export const MAX_RPE = 10;

export const MIN_HR = 30;
export const MAX_HR = 250;

/** The form's fields, exactly as strings, before anything is believed. */
export type RawRun = {
  date: string;
  /** '' when no start time was entered, which is allowed. */
  time: string;
  distanceKm: string;
  duration: string;
  avgHr: string;
  hrSource: string;
  rpe: string;
  notes: string;
  plannedWorkoutId: string | null;
};

/** A run that passed every rule, in the units the database stores. */
export type ParsedRun = {
  date: Ymd;
  /** 'HH:MM', or null when none was given and midday Paris will stand in. */
  time: string | null;
  distanceM: number;
  durationS: number;
  /** Derived, never entered. Seconds per kilometre. */
  paceSecPerKm: number;
  avgHr: number | null;
  hrSource: HrSource | null;
  rpe: number | null;
  notes: string | null;
  plannedWorkoutId: string | null;
};

export type RunReason =
  | { code: "bad_date"; value: string }
  | { code: "future_date"; date: Ymd; today: Ymd }
  | { code: "bad_time"; value: string }
  | { code: "bad_distance"; value: string }
  | { code: "distance_range"; metres: number; minM: number; maxM: number }
  | { code: "bad_duration"; value: string }
  | { code: "duration_range"; seconds: number; minS: number; maxS: number }
  | { code: "pace_too_fast"; pace: number; limit: number }
  | { code: "pace_too_slow"; pace: number; limit: number }
  | { code: "bad_hr"; value: string }
  | { code: "hr_range"; value: number; min: number; max: number }
  | { code: "hr_source_missing" }
  | { code: "hr_source_unexpected"; value: string }
  | { code: "bad_hr_source"; value: string }
  | { code: "bad_rpe"; value: string }
  | { code: "rpe_range"; value: number; min: number; max: number }
  | { code: "notes_too_long"; max: number };

export type RunWarning =
  | { code: "pace_unusually_fast"; pace: number; threshold: number }
  | { code: "pace_unusually_slow"; pace: number; threshold: number }
  | { code: "workout_has_run"; runs: number };

export type RunCheck =
  | { ok: true; run: ParsedRun; warnings: readonly RunWarning[] }
  | { ok: false; reason: RunReason };

/** Every reject code, so the message table can be proved exhaustive. */
export const RUN_REJECT_CODES = [
  "bad_date",
  "future_date",
  "bad_time",
  "bad_distance",
  "distance_range",
  "bad_duration",
  "duration_range",
  "pace_too_fast",
  "pace_too_slow",
  "bad_hr",
  "hr_range",
  "hr_source_missing",
  "hr_source_unexpected",
  "bad_hr_source",
  "bad_rpe",
  "rpe_range",
  "notes_too_long",
] as const;

/** Every warning code, likewise. */
export const RUN_WARNING_CODES = [
  "pace_unusually_fast",
  "pace_unusually_slow",
  "workout_has_run",
] as const;

export type ValidateRunInput = {
  raw: RawRun;
  /** Today in Europe/Paris. */
  today: Ymd;
  /**
   * Runs already linked to the chosen session, NOT counting the one being
   * edited. More than none is a warning, not a refusal: a session legitimately
   * gets a second run, and the athlete is the one who decides.
   */
  linkedRuns?: number;
};

function isHrSource(value: string): value is HrSource {
  return (HR_SOURCES as readonly string[]).includes(value);
}

/**
 * Whether the run can be saved, and what the athlete must confirm first.
 *
 * The order is deliberate: each field is read before the pace that depends on
 * two of them, and a rejection always wins over a warning, so one run only
 * ever has one reason. The heart rate is checked as a pair -- a reading
 * without a source and a source without a reading are different mistakes with
 * different sentences, because the two sources are never mixed or averaged.
 */
export function validateRun({ raw, today, linkedRuns = 0 }: ValidateRunInput): RunCheck {
  const reject = (reason: RunReason): RunCheck => ({ ok: false, reason });

  const date = raw.date.trim();
  if (!isValidYmd(date)) return reject({ code: "bad_date", value: date });
  // diffDays counts to - from, so a positive number puts the date after today.
  // A run that has not happened yet is not a run.
  if (diffDays(today, date) > 0) return reject({ code: "future_date", date, today });

  let time: string | null = null;
  if (!isBlank(raw.time)) {
    time = parseClock(raw.time);
    if (time === null) return reject({ code: "bad_time", value: raw.time.trim() });
  }

  const km = parseKm(raw.distanceKm);
  if (km === null) return reject({ code: "bad_distance", value: raw.distanceKm.trim() });
  const distanceM = kmToMetres(km);
  if (distanceM < MIN_DISTANCE_M || distanceM > MAX_DISTANCE_M) {
    return reject({
      code: "distance_range",
      metres: distanceM,
      minM: MIN_DISTANCE_M,
      maxM: MAX_DISTANCE_M,
    });
  }

  const durationS = parseDur(raw.duration);
  if (durationS === null) {
    return reject({ code: "bad_duration", value: raw.duration.trim() });
  }
  if (durationS < MIN_DURATION_S || durationS > MAX_DURATION_S) {
    return reject({
      code: "duration_range",
      seconds: durationS,
      minS: MIN_DURATION_S,
      maxS: MAX_DURATION_S,
    });
  }

  const pace = paceSecPerKm(distanceM, durationS);
  if (pace < MIN_PACE_S) {
    return reject({ code: "pace_too_fast", pace, limit: MIN_PACE_S });
  }
  if (pace > MAX_PACE_S) {
    return reject({ code: "pace_too_slow", pace, limit: MAX_PACE_S });
  }

  const hrGiven = !isBlank(raw.avgHr);
  const sourceGiven = !isBlank(raw.hrSource);

  let avgHr: number | null = null;
  if (hrGiven) {
    avgHr = parseWhole(raw.avgHr);
    if (avgHr === null) return reject({ code: "bad_hr", value: raw.avgHr.trim() });
    if (avgHr < MIN_HR || avgHr > MAX_HR) {
      return reject({ code: "hr_range", value: avgHr, min: MIN_HR, max: MAX_HR });
    }
  }

  // Required if and only if there is a reading, which is the column constraint
  // and the domain rule in CLAUDE.md, in both directions.
  if (hrGiven && !sourceGiven) return reject({ code: "hr_source_missing" });
  if (!hrGiven && sourceGiven) {
    return reject({ code: "hr_source_unexpected", value: raw.hrSource.trim() });
  }

  let hrSource: HrSource | null = null;
  if (sourceGiven) {
    const value = raw.hrSource.trim();
    if (!isHrSource(value)) return reject({ code: "bad_hr_source", value });
    hrSource = value;
  }

  let rpe: number | null = null;
  if (!isBlank(raw.rpe)) {
    rpe = parseWhole(raw.rpe);
    if (rpe === null) return reject({ code: "bad_rpe", value: raw.rpe.trim() });
    if (rpe < MIN_RPE || rpe > MAX_RPE) {
      return reject({ code: "rpe_range", value: rpe, min: MIN_RPE, max: MAX_RPE });
    }
  }

  // The same limit, trimming and empty-to-null rule a planned workout's note
  // gets, rather than a second definition of what a note is.
  if (notesTooLong(raw.notes)) {
    return reject({ code: "notes_too_long", max: MAX_NOTES_LENGTH });
  }

  const warnings: RunWarning[] = [];
  if (pace < WARN_FAST_PACE_S) {
    warnings.push({ code: "pace_unusually_fast", pace, threshold: WARN_FAST_PACE_S });
  }
  if (pace > WARN_SLOW_PACE_S) {
    warnings.push({ code: "pace_unusually_slow", pace, threshold: WARN_SLOW_PACE_S });
  }
  if (raw.plannedWorkoutId !== null && linkedRuns > 0) {
    warnings.push({ code: "workout_has_run", runs: linkedRuns });
  }

  return {
    ok: true,
    run: {
      date,
      time,
      distanceM,
      durationS,
      paceSecPerKm: pace,
      avgHr,
      hrSource,
      rpe,
      notes: normaliseNotes(raw.notes),
      plannedWorkoutId: raw.plannedWorkoutId,
    },
    warnings,
  };
}
