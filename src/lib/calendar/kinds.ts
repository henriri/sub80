/**
 * The words a workout kind is labelled with. Every kind marker shows one of
 * them, so colour is never the only thing carrying the meaning.
 */

import type { WorkoutKind } from "@/lib/plan";

export type KindMeta = {
  label: string;
  /** Fits a month-grid marker. Not the pace-zone key: there, R is reps. */
  short: string;
};

export const KIND_META: Record<WorkoutKind, KindMeta> = {
  easy: { label: "Easy", short: "E" },
  long: { label: "Long run", short: "LR" },
  hills: { label: "Hills", short: "H" },
  steady: { label: "Steady", short: "S" },
  sweet: { label: "Sweet spot", short: "SS" },
  threshold: { label: "Threshold", short: "T" },
  interval: { label: "Intervals", short: "I" },
  tt: { label: "Time trial", short: "TT" },
  race: { label: "Race", short: "RC" },
  rest: { label: "Rest", short: "–" },
};

/** A race or a time trial: the days the plan is built around. */
export function isEventKind(kind: WorkoutKind): boolean {
  return kind === "race" || kind === "tt";
}
