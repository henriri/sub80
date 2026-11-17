/**
 * Which status a planned workout may be asked for. Pure and framework free.
 *
 * There are two, not three. A session is completed IF AND ONLY IF a run is
 * linked to it, so `completed` is written by `log_run` and `update_run` in SQL
 * and by nothing else: there is no "Mark done" to press and no `done` action to
 * send. What is left are the two the athlete really decides -- this session did
 * not happen, and I was wrong to say so.
 *
 * `set_workout_status` in SQL still takes all three values, deliberately:
 * `undo_plan_event` has to be able to restore `completed` on an event recorded
 * before this rule existed.
 *
 * Deliberately takes no date. Skipping is exactly what a past session needs,
 * and putting one back that was marked wrongly must stay possible however long
 * ago it was -- so, unlike moving and lightening, neither transition depends on
 * today. The past-date rules live in `validateMove` and `validateLighten`,
 * which is where they belong, and `sessionActions` is what decides which of
 * these two is offered at all.
 */

import type { WorkoutStatus } from "./types";

export const STATUS_ACTIONS = ["skipped", "planned"] as const;

export type StatusAction = (typeof STATUS_ACTIONS)[number];

/** What each action asks the stored status to become. */
const TARGET: Record<StatusAction, WorkoutStatus> = {
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
 * Both transitions are allowed from any status the row might hold; the only
 * refusal is a request for the status the workout already has. That is not
 * merely tidiness: each accepted change writes a `plan_events` row and becomes
 * the one row that may be undone, so a no-op would quietly bury the athlete's
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
