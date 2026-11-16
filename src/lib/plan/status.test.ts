import { describe, expect, it } from "vitest";
import {
  STATUS_ACTIONS,
  offeredStatusActions,
  statusTarget,
  validateStatus,
} from "./status";
import { WORKOUT_STATUSES, type WorkoutStatus } from "./types";

describe("statusTarget", () => {
  it("maps the athlete's word to the column's", () => {
    // 'Mark done' is the button; 'completed' is the check constraint.
    expect(statusTarget("done")).toBe("completed");
    expect(statusTarget("skipped")).toBe("skipped");
    expect(statusTarget("planned")).toBe("planned");
  });

  it("only ever returns a stored status", () => {
    for (const action of STATUS_ACTIONS) {
      expect(WORKOUT_STATUSES).toContain(statusTarget(action));
    }
  });
});

describe("validateStatus", () => {
  it("allows every transition between two different statuses", () => {
    // The whole 3 x 3 matrix, so no pair is left to assumption. Nothing here
    // depends on the date: done and skipped are exactly what a past session
    // needs, and a mistake must stay correctable however old it is.
    const allowed: [WorkoutStatus, (typeof STATUS_ACTIONS)[number], WorkoutStatus][] = [
      ["planned", "done", "completed"],
      ["planned", "skipped", "skipped"],
      ["completed", "skipped", "skipped"],
      ["completed", "planned", "planned"],
      ["skipped", "done", "completed"],
      ["skipped", "planned", "planned"],
    ];

    for (const [from, action, to] of allowed) {
      expect(validateStatus({ from, action })).toEqual({ ok: true, from, to });
    }
  });

  it("refuses the status the workout already has", () => {
    // Not tidiness: an accepted change becomes the one undoable event, so a
    // no-op would bury the athlete's previous change under an empty undo.
    const noop: [WorkoutStatus, (typeof STATUS_ACTIONS)[number]][] = [
      ["planned", "planned"],
      ["completed", "done"],
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

describe("offeredStatusActions", () => {
  it("offers the two real changes from each status", () => {
    expect(offeredStatusActions("planned")).toEqual(["done", "skipped"]);
    expect(offeredStatusActions("completed")).toEqual(["skipped", "planned"]);
    expect(offeredStatusActions("skipped")).toEqual(["done", "planned"]);
  });

  it("agrees with validateStatus, so nothing offered can be refused", () => {
    for (const from of WORKOUT_STATUSES) {
      const offered = offeredStatusActions(from);
      for (const action of STATUS_ACTIONS) {
        expect(validateStatus({ from, action }).ok).toBe(offered.includes(action));
      }
    }
  });
});
