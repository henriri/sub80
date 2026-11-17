import { describe, expect, it } from "vitest";
import { STATUS_ACTIONS, statusTarget, validateStatus } from "./status";
import { WORKOUT_STATUSES, type WorkoutStatus } from "./types";

type StatusActionName = (typeof STATUS_ACTIONS)[number];

describe("STATUS_ACTIONS", () => {
  it("has no 'done', because a run is what completes a session", () => {
    // `completed` is written by log_run and update_run in SQL and by nothing
    // else, so there is no action here that asks for it.
    expect([...STATUS_ACTIONS]).toEqual(["skipped", "planned"]);
    expect(STATUS_ACTIONS).not.toContain("done");
  });

  it("asks for no status outside the column's three", () => {
    for (const action of STATUS_ACTIONS) {
      expect(WORKOUT_STATUSES).toContain(statusTarget(action));
    }
  });

  it("cannot ask for completed at all", () => {
    for (const action of STATUS_ACTIONS) {
      expect(statusTarget(action)).not.toBe("completed");
    }
  });
});

describe("statusTarget", () => {
  it("maps the athlete's word to the column's", () => {
    expect(statusTarget("skipped")).toBe("skipped");
    expect(statusTarget("planned")).toBe("planned");
  });
});

describe("validateStatus", () => {
  it("allows every transition that changes the status", () => {
    // Nothing here depends on the date: skipping is exactly what a past session
    // needs, and a mistake must stay correctable however old it is.
    const allowed: [WorkoutStatus, StatusActionName, WorkoutStatus][] = [
      ["planned", "skipped", "skipped"],
      ["completed", "skipped", "skipped"],
      ["completed", "planned", "planned"],
      ["skipped", "planned", "planned"],
    ];

    for (const [from, action, to] of allowed) {
      expect(validateStatus({ from, action })).toEqual({ ok: true, from, to });
    }
  });

  it("refuses the status the workout already has", () => {
    // Not tidiness: an accepted change becomes the one undoable event, so a
    // no-op would bury the athlete's previous change under an empty undo.
    const noop: [WorkoutStatus, StatusActionName][] = [
      ["planned", "planned"],
      ["skipped", "skipped"],
    ];

    for (const [from, action] of noop) {
      expect(validateStatus({ from, action })).toEqual({
        ok: false,
        reason: { code: "already", status: from },
      });
    }
  });

  it("covers every status and action between the two cases above", () => {
    let decided = 0;
    for (const from of WORKOUT_STATUSES) {
      for (const action of STATUS_ACTIONS) {
        const result = validateStatus({ from, action });
        expect(result.ok).toBe(statusTarget(action) !== from);
        decided += 1;
      }
    }
    expect(decided).toBe(WORKOUT_STATUSES.length * STATUS_ACTIONS.length);
  });
});

