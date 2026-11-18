/**
 * What the app is currently telling the athlete about a change it has just
 * saved: nothing, a countdown with an Undo button, a confirmation that the
 * change was put back, or an error.
 *
 * One state, not three independent pieces of state. A change that fails while
 * the previous toast is still counting down must take the Undo button away:
 * the event it pointed at is still undoable, but offering it next to an error
 * about a different session reads as "undo this error". Making them one union
 * makes that impossible rather than merely unlikely.
 *
 * Change, not move: a move was the first undoable action and for a while the
 * only one, but notes, a status and a lighter day go through exactly this
 * machine. The sentence for each is composed by the caller and carried here,
 * including `undoneMessage` -- what to say if the Undo button is pressed --
 * because only the caller knows what kind of change it just made. This module
 * decides when the button is offered, never what it says.
 *
 * Pure, and `now` is always an argument, so the whole state machine is
 * testable without a DOM or a timer.
 */

import {
  isExpired,
  hold as holdCountdown,
  release as releaseCountdown,
  start,
  type Countdown,
  type CountdownHold,
} from "./countdown";

export type ChangeFeedback =
  | { kind: "idle" }
  | {
      kind: "changed";
      /** The plan_events row the Undo button will name. */
      eventId: string;
      workoutId: string;
      message: string;
      /** What to say once it has been put back. Composed before it is needed. */
      undoneMessage: string;
      countdown: Countdown;
    }
  | { kind: "undone"; message: string }
  | { kind: "error"; message: string };

export type ChangeFeedbackEvent =
  | {
      type: "changed";
      eventId: string;
      workoutId: string;
      message: string;
      undoneMessage: string;
      now: number;
    }
  | { type: "undone"; message: string }
  | { type: "error"; message: string }
  | { type: "hold"; hold: CountdownHold; now: number }
  | { type: "release"; hold: CountdownHold; now: number }
  | { type: "dismiss" };

export const idle: ChangeFeedback = { kind: "idle" };

export function changeFeedback(
  state: ChangeFeedback,
  event: ChangeFeedbackEvent,
): ChangeFeedback {
  switch (event.type) {
    // A new change replaces whatever was on screen, with its own fresh window.
    // The previous event is not offered again: this toast is the only route to
    // an undo, and `undo_plan_event` would refuse the older one anyway now that
    // a newer accepted change sits above it on the stack.
    case "changed":
      return {
        kind: "changed",
        eventId: event.eventId,
        workoutId: event.workoutId,
        message: event.message,
        undoneMessage: event.undoneMessage,
        countdown: start(event.now),
      };
    case "undone":
      return { kind: "undone", message: event.message };
    case "error":
      return { kind: "error", message: event.message };
    case "dismiss":
      return idle;
    // Hovering an error or a confirmation pauses nothing, because neither has
    // a clock. Only a countdown can be held.
    case "hold":
      return state.kind === "changed"
        ? {
            ...state,
            countdown: holdCountdown(state.countdown, event.hold, event.now),
          }
        : state;
    case "release":
      return state.kind === "changed"
        ? {
            ...state,
            countdown: releaseCountdown(state.countdown, event.hold, event.now),
          }
        : state;
  }
}

/**
 * The first result the toast has not reacted to yet.
 *
 * A page with four forms has four action states, and each keeps its last
 * result for as long as the page lives. So "the newest" cannot be read off
 * their order: after a second form answers, the first still holds an answer
 * that was already shown. Every result carries a token, and the toast
 * remembers the ones it has used.
 *
 * Two identical refusals in a row are two separate things the athlete did, so
 * the token is what distinguishes them rather than the message.
 */
export function unseenResult<T extends { token: string }>(
  results: readonly (T | null | undefined)[],
  seen: ReadonlySet<string>,
): T | null {
  return results.find((result) => result != null && !seen.has(result.token)) ?? null;
}

/** Whether the Undo button should be on screen. */
export function undoOffered(state: ChangeFeedback, now: number): boolean {
  return state.kind === "changed" && !isExpired(state.countdown, now);
}

/**
 * The event the Undo button would send, or null when there is none.
 *
 * Reading the id out of the state rather than out of a ref is what stops a
 * second change's button undoing the first: the button is only ever rendered
 * from the state it was built with.
 */
export function undoTarget(state: ChangeFeedback, now: number): string | null {
  return state.kind === "changed" && undoOffered(state, now) ? state.eventId : null;
}

/**
 * How the live region should announce the state. An error interrupts, because
 * the card the athlete just dropped has snapped back under their hand, or the
 * change they asked for did not happen; the rest is polite.
 */
export function feedbackRole(state: ChangeFeedback): "alert" | "status" | null {
  switch (state.kind) {
    case "idle":
      return null;
    case "error":
      return "alert";
    case "changed":
    case "undone":
      return "status";
  }
}
