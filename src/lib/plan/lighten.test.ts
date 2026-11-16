import { describe, expect, it } from "vitest";
import { WEEKLY_CAP, addDays, weekStart } from "./dates";
import { CAP_METRES } from "./moves";
import {
  LIGHTEN_FRACTIONS,
  LIGHTEN_REJECT_CODES,
  MIN_LIGHT_DISTANCE_M,
  lightenedDistance,
  offeredFractions,
  plannedDistance,
  validateLighten,
  validateRestore,
  type LightenCandidate,
  type LightenCheck,
  type LightenFraction,
  type WeekMember,
} from "./lighten";

let nextId = 1;

function candidate(overrides: Partial<LightenCandidate> = {}): LightenCandidate {
  const id = String(nextId++).padStart(12, "0");
  return {
    id: `00000000-0000-4000-8000-${id}`,
    status: "planned",
    planned_date: day(2),
    target_distance_m: 14_000,
    original_distance_m: null,
    ...overrides,
  };
}

function member(metres: number | null, date: string = day(0)): WeekMember {
  const id = String(nextId++).padStart(12, "0");
  return {
    id: `00000000-0000-4000-8000-${id}`,
    planned_date: date,
    target_distance_m: metres,
  };
}

/**
 * Plan week 22, well inside the plan and far from both daylight-saving
 * changes. Monday 2027-03-15 to Sunday 2027-03-21.
 */
const MONDAY = weekStart(22);
const day = (offset: number) => addDays(MONDAY, offset);
/** Before every date used here, so nothing is accidentally in the past. */
const TODAY = "2027-03-01";

/** Keeps an assertion about an outcome from also being one about the data. */
const outcome = (result: LightenCheck): string =>
  result.ok ? "ok" : result.reason.code;

describe("lightenedDistance", () => {
  it("rounds to the nearest half kilometre", () => {
    // 14 km less 20% is 11.2, which is nearer 11.0 than 11.5.
    expect(lightenedDistance(14_000, 0.2)).toBe(11_000);
    // 14 km less 40% is 8.4, which is nearer 8.5 than 8.0.
    expect(lightenedDistance(14_000, 0.4)).toBe(8_500);
  });

  it("takes both fractions of the base, so they never compound", () => {
    // What -40% means does not depend on -20% having been pressed first.
    const base = 20_000;
    expect(lightenedDistance(base, 0.2)).toBe(16_000);
    expect(lightenedDistance(lightenedDistance(base, 0.2), 0.2)).not.toBe(
      lightenedDistance(base, 0.4),
    );
    expect(lightenedDistance(base, 0.4)).toBe(12_000);
  });

  it("never goes below one kilometre", () => {
    expect(lightenedDistance(1_200, 0.4)).toBe(MIN_LIGHT_DISTANCE_M);
    expect(lightenedDistance(1_000, 0.2)).toBe(MIN_LIGHT_DISTANCE_M);
  });

  it("is never above its base, however the rounding falls", () => {
    for (const by of LIGHTEN_FRACTIONS) {
      for (let base = MIN_LIGHT_DISTANCE_M; base <= 40_000; base += 100) {
        expect(lightenedDistance(base, by)).toBeLessThanOrEqual(base);
      }
    }
  });
});

describe("plannedDistance", () => {
  it("is the original once the day has been lightened", () => {
    expect(
      plannedDistance(
        candidate({ target_distance_m: 8_500, original_distance_m: 14_000 }),
      ),
    ).toBe(14_000);
  });

  it("is the target while the day is untouched", () => {
    expect(plannedDistance(candidate({ target_distance_m: 14_000 }))).toBe(14_000);
  });
});

describe("validateLighten", () => {
  const lighten = (workout: LightenCandidate, by: LightenFraction = 0.2) =>
    validateLighten({ workout, by, today: TODAY });

  it("takes the asked-for fraction off the planned distance", () => {
    const result = lighten(candidate(), 0.4);
    expect(result).toEqual({ ok: true, fromM: 14_000, toM: 8_500 });
  });

  it("measures the second fraction against the plan, not the lighter day", () => {
    // Already at -20%. Asking for -40% lands on 40% of 14 km, not of 11 km.
    const result = lighten(
      candidate({ target_distance_m: 11_000, original_distance_m: 14_000 }),
      0.4,
    );
    expect(result).toEqual({ ok: true, fromM: 11_000, toM: 8_500 });
  });

  it("refuses a fraction that would put distance back", () => {
    // Already at -40%. -20% of the plan is more than the day now holds, and
    // only restore may raise a distance, because only restore checks the cap.
    const result = lighten(
      candidate({ target_distance_m: 8_500, original_distance_m: 14_000 }),
      0.2,
    );
    expect(result).toEqual({
      ok: false,
      reason: { code: "would_raise", fromM: 8_500, toM: 11_000 },
    });
  });

  it("refuses a day already at the floor", () => {
    expect(outcome(lighten(candidate({ target_distance_m: 1_000 })))).toBe(
      "already_minimum",
    );
  });

  it("refuses a session with no distance to take off", () => {
    expect(
      outcome(
        lighten(candidate({ target_distance_m: null, original_distance_m: null })),
      ),
    ).toBe("no_distance");
  });

  it("refuses a past day, because what happened has happened", () => {
    expect(outcome(lighten(candidate({ planned_date: addDays(TODAY, -1) })))).toBe(
      "in_past",
    );
  });

  it("allows today", () => {
    expect(outcome(lighten(candidate({ planned_date: TODAY })))).toBe("ok");
  });

  it("refuses a session that is done or skipped", () => {
    expect(outcome(lighten(candidate({ status: "completed" })))).toBe("not_planned");
    expect(outcome(lighten(candidate({ status: "skipped" })))).toBe("not_planned");
  });

  it("checks the status before the date, so history gives one reason", () => {
    const done = candidate({ status: "completed", planned_date: addDays(TODAY, -1) });
    expect(outcome(lighten(done))).toBe("not_planned");
  });
});

describe("offeredFractions", () => {
  it("offers both on a day at its planned distance", () => {
    expect(offeredFractions(candidate())).toEqual([0.2, 0.4]);
  });

  it("offers only the deeper one on a day already at -20%", () => {
    expect(
      offeredFractions(
        candidate({ target_distance_m: 11_000, original_distance_m: 14_000 }),
      ),
    ).toEqual([0.4]);
  });

  it("offers neither on a day already at -40%, so the interface says restore", () => {
    expect(
      offeredFractions(
        candidate({ target_distance_m: 8_500, original_distance_m: 14_000 }),
      ),
    ).toEqual([]);
  });

  it("offers neither when there is no distance", () => {
    expect(offeredFractions(candidate({ target_distance_m: null }))).toEqual([]);
  });

  it("agrees with validateLighten about every fraction", () => {
    // The interface must never offer what the rule would refuse.
    const workouts = [
      candidate(),
      candidate({ target_distance_m: 11_000, original_distance_m: 14_000 }),
      candidate({ target_distance_m: 8_500, original_distance_m: 14_000 }),
      candidate({ target_distance_m: 1_000 }),
      candidate({ target_distance_m: null }),
    ];

    for (const workout of workouts) {
      const offered = offeredFractions(workout);
      for (const by of LIGHTEN_FRACTIONS) {
        expect(validateLighten({ workout, by, today: TODAY }).ok).toBe(
          offered.includes(by),
        );
      }
    }
  });
});

describe("validateRestore", () => {
  /** Lightened from 14 km to 8.5 km, on the Wednesday of week 22. */
  const lightened = (overrides: Partial<LightenCandidate> = {}) =>
    candidate({ target_distance_m: 8_500, original_distance_m: 14_000, ...overrides });

  const restore = (
    workout: LightenCandidate,
    weekWorkouts: readonly WeekMember[] = [],
  ) => validateRestore({ workout, weekWorkouts, today: TODAY });

  it("puts the planned distance back", () => {
    expect(restore(lightened())).toEqual({ ok: true, fromM: 8_500, toM: 14_000 });
  });

  it("refuses a day that was never lightened", () => {
    expect(outcome(restore(candidate()))).toBe("no_original");
  });

  it("refuses a past day and a session that is done or skipped", () => {
    expect(outcome(restore(lightened({ planned_date: addDays(TODAY, -1) })))).toBe(
      "in_past",
    );
    expect(outcome(restore(lightened({ status: "completed" })))).toBe("not_planned");
  });

  it("ignores its own current distance, however it arrives in the week", () => {
    // Passed in among the week's rows, the lightened 8.5 km must not be added
    // to the restored 14 km.
    const workout = lightened();
    const rows = [member(8_500, workout.planned_date), member(10_000, day(5))];
    const withSelf: WeekMember[] = [
      { ...rows[0]!, id: workout.id },
      rows[1]!,
    ];

    expect(restore(workout, withSelf)).toEqual({ ok: true, fromM: 8_500, toM: 14_000 });
  });

  it("allows a week that lands on exactly the ceiling", () => {
    // 46 km already planned, and the restored 14 km makes 60 km exactly.
    const workout = lightened();
    const week = [member(20_000, day(0)), member(20_000, day(4)), member(6_000, day(5))];

    const result = restore(workout, week);
    expect(result).toEqual({ ok: true, fromM: 8_500, toM: 14_000 });
    expect(
      week.reduce((total, row) => total + (row.target_distance_m ?? 0), 0) + 14_000,
    ).toBe(CAP_METRES);
  });

  it("refuses a week that would land one metre over it", () => {
    const workout = lightened();
    const week = [member(20_000, day(0)), member(20_000, day(4)), member(6_001, day(5))];

    expect(restore(workout, week)).toEqual({
      ok: false,
      reason: {
        code: "week_cap_exceeded",
        weekIndex: 22,
        metres: CAP_METRES + 1,
        capKm: WEEKLY_CAP,
      },
    });
  });

  it("refuses when a run has been moved into the headroom the lightening freed", () => {
    // The week held 60 km. Lightening this session to 8.5 km freed 5.5 km, a
    // run of 5 km was moved in, and now the plan's own 14 km no longer fits.
    const workout = lightened();
    const week = [
      member(20_000, day(0)),
      member(20_000, day(4)),
      member(6_000, day(5)),
      member(5_000, day(6)),
    ];

    expect(outcome(restore(workout, week))).toBe("week_cap_exceeded");
  });

  it("counts only the week that holds the workout", () => {
    // A neighbouring week is read alongside it and must not be summed in.
    const workout = lightened();
    const week = [
      member(20_000, day(0)),
      member(20_000, day(4)),
      member(30_000, day(-1)),
      member(30_000, day(7)),
    ];

    expect(outcome(restore(workout, week))).toBe("ok");
  });
});

describe("LIGHTEN_REJECT_CODES", () => {
  it("lists every code the rules can return", () => {
    // The message table is proved exhaustive against this list, so a new code
    // that is not here would get no sentence.
    expect([...LIGHTEN_REJECT_CODES]).toEqual([
      "not_planned",
      "in_past",
      "no_distance",
      "already_minimum",
      "would_raise",
      "no_original",
      "week_cap_exceeded",
    ]);
  });
});
