/**
 * What the calendar is currently telling the athlete about a move: nothing, a
 * countdown with an Undo button, a confirmation that the move was put back, or
 * an error.
 *
 * One state, not three independent pieces of state. A move that fails while
 * the previous toast is still counting down must take the Undo button away:
 * the event it pointed at is still undoable, but offering it next to an error
 * about a different session reads as "undo this error". Making them one union
 * makes that impossible rather than merely unlikely.
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

export type MoveFeedback =
  | { kind: "idle" }
  | {
      kind: "moved";
      /** The plan_events row the Undo button will name. */
      eventId: string;
      workoutId: string;
      message: string;
      countdown: Countdown;
    }
  | { kind: "undone"; message: string }
  | { kind: "error"; message: string };

export type MoveFeedbackEvent =
  | {
      type: "moved";
      eventId: string;
      workoutId: string;
      message: string;
      now: number;
    }
  | { type: "undone"; message: string }
  | { type: "error"; message: string }
  | { type: "hold"; hold: CountdownHold; now: number }
  | { type: "release"; hold: CountdownHold; now: number }
  | { type: "dismiss" };

export const idle: MoveFeedback = { kind: "idle" };

export function moveFeedback(
  state: MoveFeedback,
  event: MoveFeedbackEvent,
): MoveFeedback {
  switch (event.type) {
    // A new move replaces whatever was on screen, with its own fresh window.
    // The previous event stays undoable from "Recent changes": what expires is
    // the shortcut, not the history.
    case "moved":
      return {
        kind: "moved",
        eventId: event.eventId,
        workoutId: event.workoutId,
        message: event.message,
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
      return state.kind === "moved"
        ? {
            ...state,
            countdown: holdCountdown(state.countdown, event.hold, event.now),
          }
        : state;
    case "release":
      return state.kind === "moved"
        ? {
            ...state,
            countdown: releaseCountdown(state.countdown, event.hold, event.now),
          }
        : state;
  }
}

/** Whether the Undo button should be on screen. */
export function undoOffered(state: MoveFeedback, now: number): boolean {
  return state.kind === "moved" && !isExpired(state.countdown, now);
}

/**
 * The event the Undo button would send, or null when there is none.
 *
 * Reading the id out of the state rather than out of a ref is what stops a
 * second move's button undoing the first move: the button is only ever
 * rendered from the state it was built with.
 */
export function undoTarget(state: MoveFeedback, now: number): string | null {
  return state.kind === "moved" && undoOffered(state, now) ? state.eventId : null;
}

/**
 * How the live region should announce the state. An error interrupts, because
 * the card the athlete just dropped has snapped back under their hand; the
 * rest is polite.
 */
export function feedbackRole(state: MoveFeedback): "alert" | "status" | null {
  switch (state.kind) {
    case "idle":
      return null;
    case "error":
      return "alert";
    case "moved":
    case "undone":
      return "status";
  }
}
