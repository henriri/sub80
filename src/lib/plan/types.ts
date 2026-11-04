import type { Ymd } from "./dates";
import type { ZoneKey } from "./vdot";

/** Matches the `kind` check on public.planned_workouts. */
export type WorkoutKind =
  | "easy"
  | "long"
  | "hills"
  | "steady"
  | "sweet"
  | "threshold"
  | "interval"
  | "tt"
  | "race"
  | "rest";

export const WORKOUT_KINDS = [
  "easy",
  "long",
  "hills",
  "steady",
  "sweet",
  "threshold",
  "interval",
  "tt",
  "race",
  "rest",
] as const satisfies readonly WorkoutKind[];

/** Matches the `status` check on public.planned_workouts. */
export type WorkoutStatus = "planned" | "completed" | "skipped";

export const WORKOUT_STATUSES = [
  "planned",
  "completed",
  "skipped",
] as const satisfies readonly WorkoutStatus[];

export type PhaseId = "P0" | "P1" | "P2" | "P3" | "P4" | "P5" | "P6";

export type Phase = {
  id: PhaseId;
  name: string;
  /** First plan week of the phase, inclusive. */
  from: number;
  /** Last plan week of the phase, inclusive. */
  to: number;
  goal: string;
};

export type Session = {
  /** Stable within the plan, e.g. 'w12-d6'. */
  id: string;
  /** 0 = Monday … 6 = Sunday. */
  dow: number;
  kind: WorkoutKind;
  title: string;
  /** Pace target; paces are computed from the athlete's current VDOT. */
  key: ZoneKey | null;
  km: number;
  strides: boolean;
};

export type Week = {
  /** Plan week, 1 to 78. */
  i: number;
  /** Monday of the week. */
  start: Ymd;
  phase: Phase;
  /** 'Build week', 'Down week', 'Race week', … */
  label: string;
  down: boolean;
  /** Weekly running volume in km: the sum of the sessions, rounded. */
  km: number;
  sessions: Session[];
};
