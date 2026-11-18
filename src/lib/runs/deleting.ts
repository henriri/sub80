/**
 * Whether deleting a run puts its session back to planned. Pure and framework
 * free.
 *
 * It is not a question any more. A session is completed if and only if a run is
 * linked to it, so deleting the only run against a session MUST put that
 * session back: leaving it marked completed with nothing behind it would be
 * exactly the state the rule exists to make impossible. There is nothing for
 * the athlete to decide, so there is no checkbox -- the dialog says what will
 * happen and the deletion does it.
 *
 * The one case that is not a reset is a session another run still points at:
 * that session is still done, by the same rule. `delete_run` RAISES on a reset
 * it cannot honour -- a run with no session, or a session with another run --
 * so this has to agree with it exactly, and the Server Action asks this
 * function against freshly read facts rather than trusting anything submitted.
 */

export type ResetInput = {
  /** Whether the run points at a session at all. */
  linked: boolean;
  /** Runs linked to that session other than the one being deleted. */
  otherRuns: number;
};

export function resetsLinkedSession({ linked, otherRuns }: ResetInput): boolean {
  // No session to put back. delete_run raises rather than silently skipping.
  if (!linked) return false;
  // The session still has a run against it, so it is still done.
  return otherRuns === 0;
}
