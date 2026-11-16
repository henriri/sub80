/**
 * Whether the delete dialog offers to put the linked session back. Pure and
 * framework free.
 *
 * The checkbox exists because deleting a run usually means the session did not
 * happen after all, and leaving it marked completed with nothing behind it is a
 * lie the athlete has to go and find. But it must only appear when ticking it
 * would actually do something, because `delete_run` refuses a reset it cannot
 * honour -- a run with no session, or a session another run still points at --
 * and a checkbox that produces an error is worse than no checkbox.
 */

export const RESET_WITHHELD_CODES = ["no_link", "other_runs", "not_completed"] as const;

export type ResetWithheld = (typeof RESET_WITHHELD_CODES)[number];

export type ResetOffer =
  | { offered: true; workoutTitle: string }
  | { offered: false; withheld: ResetWithheld };

export type ResetOfferInput = {
  workoutTitle: string | null;
  /** The session's stored status, or null when there is no session. */
  workoutStatus: string | null;
  /** Runs linked to that session other than the one being deleted. */
  otherRuns: number;
};

export function resetOffer({
  workoutTitle,
  workoutStatus,
  otherRuns,
}: ResetOfferInput): ResetOffer {
  if (workoutTitle === null || workoutStatus === null) {
    return { offered: false, withheld: "no_link" };
  }
  // delete_run raises rather than silently skipping, so this must match it.
  if (otherRuns > 0) return { offered: false, withheld: "other_runs" };
  // Already planned or skipped: there is nothing to put back.
  if (workoutStatus !== "completed") {
    return { offered: false, withheld: "not_completed" };
  }

  return { offered: true, workoutTitle };
}
