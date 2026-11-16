/**
 * Which field a refusal belongs under. Pure and framework free.
 *
 * `validateRun` returns one reason, which is right: a run has one thing wrong
 * with it at a time, and a list of eight possible complaints is noise. But one
 * message floating above the submit makes the athlete hunt for the field it is
 * about, so the reason is routed to the control it concerns.
 *
 * `pace` is not an input. It is derived from the distance and the time, and
 * neither is wrong on its own, so a pace refusal is shown beside the derived
 * pace rather than blamed on one of the two fields that produced it.
 */

import type { RunReason } from "./rules";

export const RUN_FIELDS = [
  "date",
  "time",
  "distanceKm",
  "duration",
  "pace",
  "avgHr",
  "hrSource",
  "rpe",
  "notes",
] as const;

export type RunField = (typeof RUN_FIELDS)[number];

/** The field a reason is about. A bare switch, so a new code is a type error. */
export function reasonField(reason: RunReason): RunField {
  switch (reason.code) {
    case "bad_date":
    case "future_date":
      return "date";
    case "bad_time":
      return "time";
    case "bad_distance":
    case "distance_range":
      return "distanceKm";
    case "bad_duration":
    case "duration_range":
      return "duration";
    case "pace_too_fast":
    case "pace_too_slow":
      return "pace";
    case "bad_hr":
    case "hr_range":
      return "avgHr";
    case "hr_source_missing":
    case "hr_source_unexpected":
    case "bad_hr_source":
      return "hrSource";
    case "bad_rpe":
    case "rpe_range":
      return "rpe";
    case "notes_too_long":
      return "notes";
  }
}
