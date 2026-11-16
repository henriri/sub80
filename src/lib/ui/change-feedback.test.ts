import { describe, expect, it } from "vitest";
import { UNDO_WINDOW_SECONDS, isHeld, secondsLeft } from "./countdown";
import {
  feedbackRole,
  idle,
  changeFeedback,
  undoOffered,
  undoTarget,
  type ChangeFeedback,
} from "./change-feedback";

const T0 = 1_000_000;
const at = (seconds: number) => T0 + seconds * 1000;

/**
 * A saved change, whatever kind. Both sentences are composed by the caller and
 * only carried here, so this module can be tested without any wording table.
 */
const changed = (eventId: string, now = T0): ChangeFeedback =>
  changeFeedback(idle, {
    type: "changed",
    eventId,
    workoutId: "workout-1",
    message: "Easy run moved to Saturday 20 March.",
    undoneMessage: "Easy run is back on Monday 15 March.",
    now,
  });

describe("changeFeedback", () => {
  it("starts idle, with nothing announced", () => {
    expect(idle.kind).toBe("idle");
    expect(feedbackRole(idle)).toBe(null);
    expect(undoOffered(idle, T0)).toBe(false);
    expect(undoTarget(idle, T0)).toBe(null);
  });

  it("offers undo for the event a move returned", () => {
    const state = changed("event-a");
    expect(undoTarget(state, T0)).toBe("event-a");
    expect(feedbackRole(state)).toBe("status");
  });

  it("gives a change the whole window", () => {
    const state = changed("event-a");
    expect(state.kind === "changed" && secondsLeft(state.countdown, T0)).toBe(
      UNDO_WINDOW_SECONDS,
    );
  });

  it("stops offering undo once the window has run out", () => {
    const state = changed("event-a");
    expect(undoOffered(state, at(UNDO_WINDOW_SECONDS - 1))).toBe(true);
    expect(undoOffered(state, at(UNDO_WINDOW_SECONDS))).toBe(false);
    expect(undoTarget(state, at(UNDO_WINDOW_SECONDS))).toBe(null);
  });

  it("replaces the toast on a second change, with a fresh countdown", () => {
    const first = changed("event-a");
    const second = changeFeedback(first, {
      type: "changed",
      eventId: "event-b",
      workoutId: "workout-2",
      message: "Long run moved to Sunday 21 March.",
      undoneMessage: "Long run is back on Tuesday 16 March.",
      now: at(6),
    });

    // The point of the replacement: the button can never still name event-a.
    expect(undoTarget(second, at(6))).toBe("event-b");
    expect(second.kind === "changed" && secondsLeft(second.countdown, at(6))).toBe(
      UNDO_WINDOW_SECONDS,
    );
  });

  it("takes the undo button away when a later change fails", () => {
    const state = changeFeedback(changed("event-a"), {
      type: "error",
      message: "Saturday 20 March already has 2 sessions.",
    });
    expect(state.kind).toBe("error");
    expect(undoTarget(state, T0)).toBe(null);
    expect(feedbackRole(state)).toBe("alert");
  });

  it("announces a confirmed undo politely", () => {
    const state = changeFeedback(changed("event-a"), {
      type: "undone",
      message: "Easy run is back on Monday 15 March.",
    });
    expect(state.kind).toBe("undone");
    expect(feedbackRole(state)).toBe("status");
    expect(undoTarget(state, T0)).toBe(null);
  });

  it("goes back to idle when dismissed", () => {
    expect(changeFeedback(changed("event-a"), { type: "dismiss" })).toBe(idle);
  });
});

describe("holding the countdown", () => {
  it("pauses on hover and resumes on leave", () => {
    let state = changeFeedback(changed("event-a"), {
      type: "hold",
      hold: "hover",
      now: at(2),
    });
    expect(state.kind === "changed" && isHeld(state.countdown)).toBe(true);
    expect(undoOffered(state, at(600))).toBe(true);

    state = changeFeedback(state, { type: "release", hold: "hover", now: at(600) });
    expect(undoOffered(state, at(600))).toBe(true);
    expect(undoOffered(state, at(608))).toBe(false);
  });

  it("stays paused while keyboard focus still holds it", () => {
    let state = changeFeedback(changed("event-a"), {
      type: "hold",
      hold: "hover",
      now: at(1),
    });
    state = changeFeedback(state, { type: "hold", hold: "focus", now: at(2) });
    state = changeFeedback(state, { type: "release", hold: "hover", now: at(3) });

    expect(state.kind === "changed" && isHeld(state.countdown)).toBe(true);
    expect(undoOffered(state, at(900))).toBe(true);
  });

  it("ignores a hold on a state that has no clock", () => {
    const error = changeFeedback(idle, { type: "error", message: "No." });
    expect(changeFeedback(error, { type: "hold", hold: "hover", now: T0 })).toBe(error);
    expect(changeFeedback(idle, { type: "release", hold: "focus", now: T0 })).toBe(idle);
  });
});
