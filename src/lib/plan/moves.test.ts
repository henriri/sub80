import { describe, expect, it } from "vitest";
import { MAX_WEEK, RACE_DATE, addDays, weekStart } from "./dates";
import {
  MAX_PER_DAY,
  MAX_RUNS_PER_WEEK,
  moveReadRange,
  nextFreeSlot,
  validateMove,
  type MoveCandidate,
  type MoveCheck,
} from "./moves";

let nextId = 1;

function candidate(
  planned_date: string,
  overrides: Partial<MoveCandidate> = {},
): MoveCandidate {
  const id = String(nextId++).padStart(12, "0");
  return {
    id: `00000000-0000-4000-8000-${id}`,
    planned_date,
    target_distance_m: 10_000,
    is_key: false,
    status: "planned",
    day_slot: 0,
    title: "Easy run",
    ...overrides,
  };
}

/** A key session, which is what the consecutive-key rule keys on. */
const key = (date: string, overrides: Partial<MoveCandidate> = {}) =>
  candidate(date, { is_key: true, title: "Threshold 3 × 12′", ...overrides });

/**
 * Plan week 22, well inside the plan and far from both daylight-saving
 * changes. Monday 2027-03-15 to Sunday 2027-03-21.
 */
const MONDAY = weekStart(22);
const day = (offset: number) => addDays(MONDAY, offset);
/** Before every date used here, so nothing is accidentally in the past. */
const TODAY = "2027-03-01";

const check = (
  workout: MoveCandidate,
  toDate: string,
  weekWorkouts: readonly MoveCandidate[],
  today = TODAY,
): MoveCheck => validateMove({ workout, toDate, weekWorkouts, today });

/** The reason code, or 'ok'. Keeps the assertions about one thing. */
function outcome(result: MoveCheck): string {
  return result.ok ? "ok" : result.reason.code;
}

function warningCodes(result: MoveCheck): string[] {
  return result.ok ? result.warnings.map((warning) => warning.code) : [];
}

describe("nextFreeSlot", () => {
  it("fills slot 0 first, then slot 1, then refuses", () => {
    expect(nextFreeSlot([])).toBe(0);
    expect(nextFreeSlot([candidate(day(0), { day_slot: 0 })])).toBe(1);
    // A lone workout in slot 1 leaves slot 0 free, which undo relies on.
    expect(nextFreeSlot([candidate(day(0), { day_slot: 1 })])).toBe(0);
    expect(
      nextFreeSlot([
        candidate(day(0), { day_slot: 0 }),
        candidate(day(0), { day_slot: 1 }),
      ]),
    ).toBeNull();
  });
});

describe("moveReadRange", () => {
  it("covers one whole week for a move inside it", () => {
    // Tuesday to Saturday: the week, and no more, because the days either
    // side of Saturday are already in it.
    expect(moveReadRange(day(1), day(5))).toEqual({ from: day(0), to: day(6) });
  });

  it("covers both weeks for a move to the next one", () => {
    expect(moveReadRange(day(1), day(8))).toEqual({ from: day(0), to: day(13) });
  });

  it("covers both weeks and the gap between them", () => {
    expect(moveReadRange(day(1), day(30))).toEqual({ from: day(0), to: day(34) });
  });

  it("reaches a day past the destination week on both sides", () => {
    // Onto Monday of week 23: the range starts on the Sunday before it, which
    // is in week 22. Without that day the Sunday that would make a
    // consecutive-key pair would be invisible.
    expect(moveReadRange(day(8), day(7)).from).toBe(day(6));
    // And onto a Sunday, where the Monday after is in the next week.
    expect(moveReadRange(day(1), day(6)).to).toBe(day(7));
  });

  it("reaches around the destination only, not the source", () => {
    // Deliberately asymmetric: the consecutive-key rule asks what sits beside
    // the day the workout lands on. What sat beside the day it left does not
    // matter, because it is leaving.
    expect(moveReadRange(day(1), day(20)).to).toBe(day(21));
    expect(moveReadRange(day(20), day(1)).to).toBe(day(20));
  });
});

describe("validateMove", () => {
  describe("rejections", () => {
    it("refuses a workout that is not planned", () => {
      const workout = candidate(day(1), { status: "completed" });
      expect(outcome(check(workout, day(3), [workout]))).toBe("not_planned");

      const skipped = candidate(day(1), { status: "skipped" });
      expect(outcome(check(skipped, day(3), [skipped]))).toBe("not_planned");
    });

    it("refuses a move to the day it is already on", () => {
      const workout = candidate(day(1));
      expect(outcome(check(workout, day(1), [workout]))).toBe("same_date");
    });

    it("refuses to move a workout out of the past", () => {
      const workout = candidate(day(1));
      // Today is after the source day.
      expect(outcome(check(workout, day(3), [workout], day(2)))).toBe("source_in_past");
    });

    it("refuses a move onto a past day", () => {
      const workout = candidate(day(3));
      expect(outcome(check(workout, day(1), [workout], day(2)))).toBe(
        "destination_in_past",
      );
    });

    it("allows a move onto today", () => {
      const workout = candidate(day(3));
      expect(outcome(check(workout, day(1), [workout], day(1)))).toBe("ok");
    });

    it("refuses a destination outside the 78 plan weeks", () => {
      const workout = candidate(day(1));
      // The day before week 1 starts, and the day after race week ends.
      expect(outcome(check(workout, "2026-10-18", [workout], "2026-10-01"))).toBe(
        "outside_plan",
      );
      expect(outcome(check(workout, addDays(RACE_DATE, 1), [workout]))).toBe(
        "outside_plan",
      );
    });

    it("accepts the first and last day of the plan", () => {
      const first = candidate("2026-10-20");
      expect(outcome(check(first, "2026-10-19", [first], "2026-10-01"))).toBe("ok");

      const last = candidate(addDays(RACE_DATE, -2));
      expect(outcome(check(last, RACE_DATE, [last]))).toBe("ok");
      expect(weekStart(MAX_WEEK)).toBe(addDays(RACE_DATE, -6));
    });

    it("refuses a third workout on a day", () => {
      const workout = candidate(day(1));
      const result = check(workout, day(3), [
        workout,
        candidate(day(3), { day_slot: 0 }),
        candidate(day(3), { day_slot: 1 }),
      ]);

      expect(outcome(result)).toBe("day_full");
      expect(result.ok ? null : result.reason).toMatchObject({ max: MAX_PER_DAY });
    });
  });

  describe("the day a workout lands on", () => {
    it("warns about a double day when the day already holds one", () => {
      const workout = candidate(day(1));
      const other = candidate(day(3), { title: "Easy shakeout" });
      const result = check(workout, day(3), [workout, other]);

      expect(warningCodes(result)).toEqual(["double_day"]);
      expect(result.ok ? result.warnings[0] : null).toMatchObject({
        code: "double_day",
        date: day(3),
        other: { id: other.id, title: "Easy shakeout", isKey: false },
        bothKey: false,
      });
    });

    it("says so when both sessions on the day are key ones", () => {
      const workout = key(day(1));
      const result = check(workout, day(3), [
        workout,
        key(day(3), { title: "30′ time trial" }),
      ]);

      expect(result.ok ? result.warnings[0] : null).toMatchObject({
        code: "double_day",
        bothKey: true,
        other: { title: "30′ time trial", isKey: true },
      });
    });

    it("does not warn when only the moved session is a key one", () => {
      const workout = key(day(1));
      const result = check(workout, day(3), [workout, candidate(day(3))]);

      expect(result.ok ? result.warnings[0] : null).toMatchObject({ bothKey: false });
    });

    it("does not warn when the day is empty", () => {
      const workout = candidate(day(1));
      expect(warningCodes(check(workout, day(3), [workout]))).toEqual([]);
    });
  });

  describe("two key sessions on consecutive days", () => {
    it("warns about the day before", () => {
      const workout = key(day(5));
      const neighbour = key(day(2), { title: "Long run" });
      const result = check(workout, day(3), [workout, neighbour]);

      expect(warningCodes(result)).toEqual(["consecutive_key"]);
      expect(result.ok ? result.warnings[0] : null).toMatchObject({
        code: "consecutive_key",
        date: day(3),
        neighbourDate: day(2),
        neighbour: { title: "Long run" },
        side: "before",
      });
    });

    it("warns about the day after", () => {
      const workout = key(day(0));
      const result = check(workout, day(3), [workout, key(day(4))]);

      expect(result.ok ? result.warnings[0] : null).toMatchObject({ side: "after" });
    });

    it("warns once per side, so a key session on both sides warns twice", () => {
      const workout = key(day(0));
      const result = check(workout, day(3), [workout, key(day(2)), key(day(4))]);

      expect(warningCodes(result)).toEqual(["consecutive_key", "consecutive_key"]);
    });

    it("ignores a neighbour that is not a key session", () => {
      const workout = key(day(5));
      expect(warningCodes(check(workout, day(3), [workout, candidate(day(2))]))).toEqual(
        [],
      );
    });

    it("does not warn when the moved session is not a key one", () => {
      const workout = candidate(day(5));
      expect(warningCodes(check(workout, day(3), [workout, key(day(2))]))).toEqual([]);
    });

    it("sees across a week boundary, from Monday back to Sunday", () => {
      // Monday of week 23, with the key session on Sunday of week 22. The
      // neighbour is in neither the source nor the destination week, which is
      // why moveReadRange reaches a day past both.
      const workout = key(day(9));
      const sunday = key(day(6), { title: "Long run" });
      const result = check(workout, day(7), [workout, sunday]);

      expect(warningCodes(result)).toEqual(["consecutive_key"]);
      expect(result.ok ? result.warnings[0] : null).toMatchObject({
        neighbourDate: day(6),
        side: "before",
      });
    });

    it("sees across a week boundary, from Sunday on to Monday", () => {
      const workout = key(day(3));
      const result = check(workout, day(6), [workout, key(day(7))]);

      expect(result.ok ? result.warnings[0] : null).toMatchObject({
        neighbourDate: day(7),
        side: "after",
      });
    });

    it("would miss the Sunday neighbour if the window stopped at the weeks", () => {
      // The regression guard for moveReadRange: the same move, given only the
      // two weeks' own days, cannot warn. If this ever returns a warning, the
      // ±1-day reach has become unnecessary and the range can be simplified.
      const workout = key(day(9));
      const withinWeeksOnly = [workout];

      expect(warningCodes(check(workout, day(7), withinWeeksOnly))).toEqual([]);
      // Both days are in week 23, so only the ±1 day reach pulls in the
      // Sunday of week 22 that the warning above depends on.
      expect(moveReadRange(day(9), day(7)).from).toBe(day(6));
    });
  });

  describe("several warnings at once", () => {
    it("reports a double day and a consecutive key session together", () => {
      const workout = key(day(0));
      const result = check(workout, day(3), [
        workout,
        key(day(3), { title: "30′ time trial" }),
        key(day(2), { title: "Long run" }),
      ]);

      expect(warningCodes(result)).toEqual(["double_day", "consecutive_key"]);
      expect(result.ok ? result.warnings : []).toHaveLength(2);
    });
  });

  describe("the five runs a week limit", () => {
    const fiveElsewhere = () => [
      candidate(day(7)),
      candidate(day(8)),
      candidate(day(9)),
      candidate(day(10)),
      candidate(day(11)),
    ];

    it("refuses a sixth run in the destination week", () => {
      const workout = candidate(day(1));
      const result = check(workout, day(12), [workout, ...fiveElsewhere()]);

      expect(outcome(result)).toBe("week_runs_exceeded");
      expect(result.ok ? null : result.reason).toMatchObject({
        runs: MAX_RUNS_PER_WEEK + 1,
        max: MAX_RUNS_PER_WEEK,
      });
    });

    it("allows a fifth", () => {
      const workout = candidate(day(1), { target_distance_m: 5000 });
      const week = fiveElsewhere().slice(0, 4);
      expect(outcome(check(workout, day(12), [workout, ...week]))).toBe("ok");
    });

    it("counts a double day as two runs", () => {
      // Four days in the destination week, one of them doubled, is five runs.
      const workout = candidate(day(1), { target_distance_m: 1000 });
      const week = [
        candidate(day(7)),
        candidate(day(8)),
        candidate(day(9)),
        candidate(day(10)),
        candidate(day(10), { day_slot: 1 }),
      ];

      expect(outcome(check(workout, day(12), [workout, ...week]))).toBe(
        "week_runs_exceeded",
      );
    });

    it("refuses a double day in a week already at five runs", () => {
      // The day has room, and the week does not. The week wins.
      const workout = candidate(day(1), { target_distance_m: 1000 });
      const result = check(workout, day(7), [workout, ...fiveElsewhere()]);

      expect(outcome(result)).toBe("week_runs_exceeded");
    });

    it("lets a full week be rearranged inside itself", () => {
      const workout = candidate(day(0));
      const week = [
        workout,
        candidate(day(1)),
        candidate(day(2)),
        candidate(day(3)),
        candidate(day(4)),
      ];

      expect(outcome(check(workout, day(6), week))).toBe("ok");
    });
  });

  describe("the 60 km ceiling", () => {
    /** Four 15 km runs: a destination week sitting at exactly the cap. */
    const atTheCap = () => [
      candidate(day(7), { target_distance_m: 15_000 }),
      candidate(day(8), { target_distance_m: 15_000 }),
      candidate(day(9), { target_distance_m: 15_000 }),
      candidate(day(10), { target_distance_m: 15_000 }),
    ];

    it("refuses any distance into a week already at 60 km", () => {
      const workout = candidate(day(1), { target_distance_m: 1000 });
      const result = check(workout, day(12), [workout, ...atTheCap()]);

      expect(outcome(result)).toBe("week_cap_exceeded");
      expect(result.ok ? null : result.reason).toMatchObject({
        metres: 61_000,
        capKm: 60,
      });
    });

    it("allows a workout with no distance into a week at 60 km", () => {
      // A cross-training or rest row adds nothing, so the ceiling is untouched.
      const workout = candidate(day(1), { target_distance_m: null });
      expect(outcome(check(workout, day(12), [workout, ...atTheCap()]))).toBe("ok");
    });

    it("allows a move that lands exactly on 60 km", () => {
      // The generated plan's peak week is exactly 60 000 m, so this boundary
      // is the real one, not a hypothetical.
      const workout = candidate(day(1), { target_distance_m: 5000 });
      const week = [
        candidate(day(7), { target_distance_m: 20_000 }),
        candidate(day(8), { target_distance_m: 20_000 }),
        candidate(day(9), { target_distance_m: 15_000 }),
      ];

      const result = check(workout, day(12), [workout, ...week]);
      expect(outcome(result)).toBe("ok");
    });

    it("refuses the metre that goes over", () => {
      const workout = candidate(day(1), { target_distance_m: 5001 });
      const week = [
        candidate(day(7), { target_distance_m: 20_000 }),
        candidate(day(8), { target_distance_m: 20_000 }),
        candidate(day(9), { target_distance_m: 15_000 }),
      ];

      expect(outcome(check(workout, day(12), [workout, ...week]))).toBe(
        "week_cap_exceeded",
      );
    });

    it("never changes the total for a move inside one week", () => {
      // A week at the cap can still be rearranged: the distance does not move
      // between weeks, so the ceiling is not consulted.
      const workout = candidate(day(10), { target_distance_m: 15_000 });
      const week = [
        workout,
        candidate(day(7), { target_distance_m: 15_000 }),
        candidate(day(8), { target_distance_m: 15_000 }),
        candidate(day(9), { target_distance_m: 15_000 }),
      ];

      expect(outcome(check(workout, day(11), week))).toBe("ok");
      // Including onto a day that is already occupied, which only warns.
      expect(warningCodes(check(workout, day(9), week))).toEqual(["double_day"]);
    });

    it("does not count the moved workout twice when it is already in the week", () => {
      // Moving a 15 km run from Monday to Friday inside a 60 km week: if the
      // workout were counted in the destination week as well as added to it,
      // this would read as 75 km and be refused.
      const workout = candidate(day(7), { target_distance_m: 15_000 });
      const week = [workout, ...atTheCap().slice(1)];

      expect(outcome(check(workout, day(11), week))).toBe("ok");
    });
  });

  describe("daylight saving", () => {
    // Europe/Paris springs forward on 2027-03-28 and falls back on
    // 2027-10-31, both Sundays. All the arithmetic is in UTC, so a move
    // across one must land on the day asked for and stay in its own week.
    const transitions = [
      { name: "spring forward", sunday: "2027-03-28" },
      { name: "autumn fall back", sunday: "2027-10-31" },
    ];

    it.each(transitions)("keeps a move inside the $name week", ({ sunday }) => {
      const saturday = addDays(sunday, -1);
      const workout = candidate(saturday, { target_distance_m: 12_000 });
      const week = [workout, candidate(addDays(sunday, -3))];

      const result = check(workout, sunday, week);
      expect(outcome(result)).toBe("ok");
      // The same week, so the weekly limits were never consulted.
      expect(weekStart(22)).toBe(MONDAY);
      expect(moveReadRange(saturday, sunday)).toEqual({
        from: addDays(sunday, -6),
        to: addDays(sunday, 1),
      });
    });

    it.each(transitions)("crosses the $name boundary onto the Monday", ({ sunday }) => {
      const monday = addDays(sunday, 1);
      const workout = key(addDays(sunday, -2));
      const neighbour = key(sunday, { title: "Long run" });

      const result = check(workout, monday, [workout, neighbour]);
      expect(outcome(result)).toBe("ok");
      // The Sunday is the day before the Monday across the clock change too.
      expect(result.ok ? result.warnings[0] : null).toMatchObject({
        code: "consecutive_key",
        neighbourDate: sunday,
        side: "before",
      });
    });
  });
});
