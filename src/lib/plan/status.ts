/**
 * Which status a planned workout may be moved to. Pure and framework free.
 *
 * Deliberately takes no date. Done and skipped are exactly what a past session
 * needs, and resetting one that was marked wrongly must stay possible however
 * long ago it was -- so, unlike moving and lightening, none of these
 * transitions depends on today. The past-date rules live in `validateMove` and
 * `validateLighten`, which is where they belong.
 *
 * `done` rather than `completed` on the way in: the athlete presses "Mark
 * done", and the stored value is the column's own vocabulary. Keeping the two
 * apart means the button copy and the check constraint can never be confused
 * for each other.
 */

import type { WorkoutStatus } from "./types";

export const STATUS_ACTIONS = ["done", "skipped", "planned"] as const;

export type StatusAction = (typeof STATUS_ACTIONS)[number];

/** What each action asks the stored status to become. */
const TARGET: Record<StatusAction, WorkoutStatus> = {
  done: "completed",
  skipped: "skipped",
  planned: "planned",
};

export const STATUS_REJECT_CODES = ["already"] as const;

export type StatusReason = { code: "already"; status: WorkoutStatus };

export type StatusCheck =
  | { ok: true; from: WorkoutStatus; to: WorkoutStatus }
  | { ok: false; reason: StatusReason };

/** The stored status an action asks for. */
export function statusTarget(action: StatusAction): WorkoutStatus {
  return TARGET[action];
}

/**
 * Whether the transition is a change at all.
 *
 * Every transition between the three statuses is allowed; the only refusal is
 * a request for the status the workout already has. That is not merely
 * tidiness: each accepted change writes a `plan_events` row and becomes the
 * one row that may be undone, so a no-op would quietly bury the athlete's
 * previous change under an event that restores nothing.
 */
export function validateStatus({
  from,
  action,
}: {
  from: WorkoutStatus;
  action: StatusAction;
}): StatusCheck {
  const to = statusTarget(action);
  if (to === from) return { ok: false, reason: { code: "already", status: from } };
  return { ok: true, from, to };
}

/** The actions worth offering for a workout, which is every real change. */
export function offeredStatusActions(
  from: WorkoutStatus,
): readonly StatusAction[] {
  return STATUS_ACTIONS.filter((action) => validateStatus({ from, action }).ok);
}
