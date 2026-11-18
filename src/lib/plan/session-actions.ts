/**
 * What a session offers the athlete. Pure and framework free, and the ONLY
 * place that decides it: the detail page, the calendar card and the drag layer
 * all render from this and nothing else.
 *
 * The rule it exists to make true everywhere:
 *
 *   A session is completed IF AND ONLY IF a run is linked to it.
 *
 * Completion is a consequence of logging, never something the athlete ticks.
 * `log_run` and `update_run` are the only writers of `completed`, in SQL; there
 * is no "Mark done". So `done` here is read off the linked runs and never off
 * the stored status -- and a legacy row that says `completed` with nothing
 * behind it is treated as what it is, a session still waiting for its run.
 *
 * Nothing here reads a clock. `today` is an argument, like `parisDate(now)`,
 * because a render has no meaningful "now".
 *
 * The two plan rules are DERIVED from the validators the Server Actions re-run
 * -- `isSourceInPast` out of `validateMove`, `canLighten` out of
 * `validateLighten` -- rather than restated, so nothing offered here can be
 * refused there. The one deliberate asymmetry is a session dated today: it is
 * offered Log run rather than Move, although `validateMove` would still allow
 * the move. Being stricter than the server is safe; the reverse would not be,
 * and the tests assert that direction only.
 */

import { canLighten, type LightenCandidate } from "./lighten";
import { isSourceInPast } from "./moves";
import type { Ymd } from "./dates";

/**
 * What the rules need from a session: exactly `LightenCandidate`, which is
 * already a structural subset of the stored row, so a caller passes rows
 * straight through and `WorkoutDetail` satisfies it as it is.
 */
export type SessionCandidate = LightenCandidate;

/** A run linked to the session. Only its existence matters to the rules. */
export type LinkedRun = { id: string };

export type SessionActions = {
  /** A run is linked, so the session happened. The one definition of done. */
  done: boolean;
  /** Log the run that happened. The primary action whenever it is offered. */
  canLogRun: boolean;
  /** Pick the session up: drag it, or reach the "Move to…" picker. */
  canMove: boolean;
  canLighten: boolean;
  /**
   * Put the plan's own distance back on a day that was made lighter.
   *
   * The gate only, not the arithmetic: restoring is the one action that can
   * RAISE a week's total, and the 60 km ceiling needs the whole week in hand,
   * which a session on its own does not have. `validateRestore` re-runs with
   * the week when the Server Action writes.
   */
  canRestore: boolean;
  canSkip: boolean;
  canBackToPlanned: boolean;
};

/**
 * Whether a session can be picked up at all: dragged, or taken to the
 * "Move to…" picker.
 *
 * Exported as its own predicate because the drag layer asks exactly this, about
 * a card that carries no distances. `sessionActions` answers it with this
 * function rather than beside it, so the handle on a card and the buttons on
 * the detail page cannot come to different conclusions.
 */
export function canMoveSession(
  session: Pick<SessionCandidate, "status" | "planned_date">,
  linkedRuns: readonly LinkedRun[],
  today: Ymd,
): boolean {
  if (linkedRuns.length > 0) return false;
  return session.status === "planned" && isAhead(session, today);
}

/**
 * Still ahead: not behind today -- which is `validateMove`'s own rule, asked of
 * it rather than restated -- and not today either.
 *
 * A session dated today is not in the past, but it is no longer a plan: the
 * thing to do with it is log the run, not rearrange it. That makes this
 * strictly stricter than the server, which is the safe direction.
 */
function isAhead(
  session: Pick<SessionCandidate, "planned_date">,
  today: Ymd,
): boolean {
  return !isSourceInPast(session, today) && session.planned_date !== today;
}

/**
 * Everything a session offers, in one answer.
 *
 * A linked run closes the session down to its summary and an Edit run link:
 * no Log run from here, no Skip, no Back to planned, no lighter day and no drag
 * handle. Changing what happened means editing the run, and un-happening it
 * means deleting the run -- both on the run's own page.
 */
export function sessionActions(
  session: SessionCandidate,
  linkedRuns: readonly LinkedRun[],
  today: Ymd,
): SessionActions {
  const done = linkedRuns.length > 0;

  if (done) {
    return {
      done: true,
      canLogRun: false,
      canMove: false,
      canLighten: false,
      canRestore: false,
      canSkip: false,
      canBackToPlanned: false,
    };
  }

  const planned = session.status === "planned";
  const ahead = isAhead(session, today);

  return {
    done: false,
    // Nothing to log before the day has come, and everything to log from it on.
    canLogRun: !ahead,
    canMove: canMoveSession(session, linkedRuns, today),
    canLighten: planned && ahead && canLighten(session, today),
    canRestore: planned && ahead && session.original_distance_m !== null,
    // Only a session still planned can be skipped. One already skipped, or
    // wrongly marked completed with nothing behind it, is put back instead.
    canSkip: planned,
    canBackToPlanned: !planned,
  };
}
