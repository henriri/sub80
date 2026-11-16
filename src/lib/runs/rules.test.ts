import { describe, expect, it } from "vitest";
import {
  MAX_DISTANCE_M,
  MAX_DURATION_S,
  MAX_PACE_S,
  MIN_DISTANCE_M,
  MIN_DURATION_S,
  MIN_PACE_S,
  RUN_REJECT_CODES,
  RUN_WARNING_CODES,
  WARN_FAST_PACE_S,
  WARN_SLOW_PACE_S,
  validateRun,
  type RawRun,
  type RunCheck,
} from "./rules";

/**
 * Well inside the plan and well after both 2027 daylight-saving changes, so a
 * date in a test is never accidentally in the future.
 */
const TODAY = "2027-12-01";

function raw(overrides: Partial<RawRun> = {}): RawRun {
  return {
    date: "2027-11-20",
    time: "",
    // 10 km in 50:00 is 5:00 /km: inside every window, so a test that is not
    // about pace never trips a pace rule.
    distanceKm: "10",
    duration: "50:00",
    avgHr: "",
    hrSource: "",
    rpe: "",
    notes: "",
    plannedWorkoutId: null,
    ...overrides,
  };
}

/** Collapses a result so an assertion is about one thing. */
const outcome = (result: RunCheck): string =>
  result.ok ? "ok" : result.reason.code;

/** The warning codes a result carries, in order. */
const warnings = (result: RunCheck): string[] =>
  result.ok ? result.warnings.map((warning) => warning.code) : [];

describe("validateRun", () => {
  it("accepts a plain run and derives its pace", () => {
    const result = validateRun({ raw: raw(), today: TODAY });

    expect(result).toEqual({
      ok: true,
      warnings: [],
      run: {
        date: "2027-11-20",
        time: null,
        distanceM: 10_000,
        durationS: 3000,
        paceSecPerKm: 300,
        avgHr: null,
        hrSource: null,
        rpe: null,
        notes: null,
        plannedWorkoutId: null,
      },
    });
  });

  it("reads a distance written with a comma exactly as one written with a dot", () => {
    const comma = validateRun({ raw: raw({ distanceKm: "7,5" }), today: TODAY });
    const dot = validateRun({ raw: raw({ distanceKm: "7.5" }), today: TODAY });

    expect(comma).toEqual(dot);
    expect(comma.ok && comma.run.distanceM).toBe(7500);
  });

  it("keeps a start time when one is given, and null when it is not", () => {
    const withTime = validateRun({ raw: raw({ time: "07:30" }), today: TODAY });
    expect(withTime.ok && withTime.run.time).toBe("07:30");
    expect(validateRun({ raw: raw(), today: TODAY }).ok && null).toBeNull();
  });

  it("trims a note and stores an empty one as null", () => {
    const result = validateRun({ raw: raw({ notes: "  Legs heavy.  " }), today: TODAY });
    expect(result.ok && result.run.notes).toBe("Legs heavy.");

    const blank = validateRun({ raw: raw({ notes: "   " }), today: TODAY });
    expect(blank.ok && blank.run.notes).toBeNull();
  });
});

describe("the date", () => {
  it("accepts today", () => {
    expect(outcome(validateRun({ raw: raw({ date: TODAY }), today: TODAY }))).toBe("ok");
  });

  it("refuses tomorrow, because a run that has not happened is not a run", () => {
    expect(outcome(validateRun({ raw: raw({ date: "2027-12-02" }), today: TODAY }))).toBe(
      "future_date",
    );
  });

  it("refuses a date that is not a date", () => {
    for (const date of ["", "2027-02-30", "20271120", "not a date"]) {
      expect(outcome(validateRun({ raw: raw({ date }), today: TODAY })), date).toBe(
        "bad_date",
      );
    }
  });

  /*
   * Europe/Paris springs forward on 2027-03-28 and falls back on 2027-10-31.
   * A date is a plain 'YYYY-MM-DD' string and the arithmetic runs in UTC, so
   * neither transition can shift a day -- which is the whole reason the rules
   * take `today` rather than reading a clock. The database functions refuse
   * these dates as being in the future, so SQL exercises the 2026
   * transitions instead; see supabase/tests/runs.test.sql.
   */
  it("treats both 2027 daylight-saving days as ordinary past days", () => {
    for (const date of ["2027-03-28", "2027-10-31"]) {
      const result = validateRun({ raw: raw({ date }), today: TODAY });
      expect(outcome(result), date).toBe("ok");
      expect(result.ok && result.run.date, date).toBe(date);
    }
  });

  it("accepts a daylight-saving day when it is itself today", () => {
    for (const date of ["2027-03-28", "2027-10-31"]) {
      expect(outcome(validateRun({ raw: raw({ date }), today: date })), date).toBe("ok");
    }
  });

  it("refuses the day after a daylight-saving day", () => {
    expect(
      outcome(validateRun({ raw: raw({ date: "2027-03-29" }), today: "2027-03-28" })),
    ).toBe("future_date");
    expect(
      outcome(validateRun({ raw: raw({ date: "2027-11-01" }), today: "2027-10-31" })),
    ).toBe("future_date");
  });
});

describe("the start time", () => {
  it("refuses a time that is not one", () => {
    for (const time of ["7:30", "24:00", "07:60", "morning"]) {
      expect(outcome(validateRun({ raw: raw({ time }), today: TODAY })), time).toBe(
        "bad_time",
      );
    }
  });
});

describe("distance and duration", () => {
  it("refuses a distance that is not a number", () => {
    for (const distanceKm of ["", "ten", "7.5.2"]) {
      expect(
        outcome(validateRun({ raw: raw({ distanceKm }), today: TODAY })),
        distanceKm,
      ).toBe("bad_distance");
    }
  });

  it("accepts both ends of the distance range and refuses just outside them", () => {
    // 0.1 km in 1 minute is 10:00 /km, inside the hard pace window.
    expect(
      outcome(validateRun({ raw: raw({ distanceKm: "0,1", duration: "1" }), today: TODAY })),
    ).toBe("ok");
    expect(
      outcome(
        validateRun({ raw: raw({ distanceKm: "100", duration: "10:00:00" }), today: TODAY }),
      ),
    ).toBe("ok");

    expect(
      outcome(
        validateRun({ raw: raw({ distanceKm: "0,09", duration: "1" }), today: TODAY }),
      ),
    ).toBe("distance_range");
    expect(
      outcome(
        validateRun({ raw: raw({ distanceKm: "101", duration: "10:00:00" }), today: TODAY }),
      ),
    ).toBe("distance_range");
  });

  it("refuses a duration that is not one", () => {
    for (const duration of ["", "ages", "7:5"]) {
      expect(outcome(validateRun({ raw: raw({ duration }), today: TODAY })), duration).toBe(
        "bad_duration",
      );
    }
  });

  it("accepts both ends of the duration range and refuses just outside them", () => {
    // 1 minute over 0.2 km is 5:00 /km; 12 hours over 100 km is 7:12 /km.
    expect(
      outcome(validateRun({ raw: raw({ distanceKm: "0,2", duration: "1:00" }), today: TODAY })),
    ).toBe("ok");
    expect(
      outcome(
        validateRun({ raw: raw({ distanceKm: "100", duration: "12:00:00" }), today: TODAY }),
      ),
    ).toBe("ok");

    expect(
      outcome(
        validateRun({ raw: raw({ distanceKm: "0,2", duration: "0:59" }), today: TODAY }),
      ),
    ).toBe("duration_range");
    expect(
      outcome(
        validateRun({ raw: raw({ distanceKm: "100", duration: "12:00:01" }), today: TODAY }),
      ),
    ).toBe("duration_range");
  });

  it("states the bounds it was built with", () => {
    expect([MIN_DISTANCE_M, MAX_DISTANCE_M]).toEqual([100, 100_000]);
    expect([MIN_DURATION_S, MAX_DURATION_S]).toEqual([60, 43_200]);
  });
});

describe("the pace window", () => {
  /**
   * Always 'h:mm:ss', never bare minutes: parseDur reads a bare number as
   * minutes, so writing seconds there would build a run sixty times too long.
   */
  const hms = (seconds: number) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${Math.floor(seconds / 3600)}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(
      seconds % 60,
    )}`;
  };

  /** A run of `metres` at exactly `pace` seconds per kilometre. */
  const atPace = (pace: number, metres = 10_000) =>
    raw({
      distanceKm: String(metres / 1000),
      duration: hms(Math.round(pace * (metres / 1000))),
    });

  it("accepts exactly 2:00 /km and refuses anything faster", () => {
    expect(outcome(validateRun({ raw: atPace(MIN_PACE_S), today: TODAY }))).toBe("ok");
    expect(outcome(validateRun({ raw: atPace(MIN_PACE_S - 1), today: TODAY }))).toBe(
      "pace_too_fast",
    );
  });

  it("accepts exactly 20:00 /km and refuses anything slower", () => {
    expect(outcome(validateRun({ raw: atPace(MAX_PACE_S), today: TODAY }))).toBe("ok");
    expect(outcome(validateRun({ raw: atPace(MAX_PACE_S + 1), today: TODAY }))).toBe(
      "pace_too_slow",
    );
  });

  it("warns below 3:00 /km but not at it", () => {
    expect(warnings(validateRun({ raw: atPace(WARN_FAST_PACE_S), today: TODAY }))).toEqual(
      [],
    );
    expect(
      warnings(validateRun({ raw: atPace(WARN_FAST_PACE_S - 1), today: TODAY })),
    ).toEqual(["pace_unusually_fast"]);
  });

  it("warns above 8:30 /km but not at it", () => {
    expect(warnings(validateRun({ raw: atPace(WARN_SLOW_PACE_S), today: TODAY }))).toEqual(
      [],
    );
    expect(
      warnings(validateRun({ raw: atPace(WARN_SLOW_PACE_S + 1), today: TODAY })),
    ).toEqual(["pace_unusually_slow"]);
  });

  it("still returns the run alongside a warning, because a warning is not a refusal", () => {
    const result = validateRun({ raw: atPace(WARN_SLOW_PACE_S + 60), today: TODAY });
    expect(result.ok && result.run.paceSecPerKm).toBe(570);
  });

  it("refuses rather than warns when the pace is past the hard limit", () => {
    // A rejection always wins over a warning, so one run has one reason.
    expect(outcome(validateRun({ raw: atPace(60), today: TODAY }))).toBe("pace_too_fast");
    expect(outcome(validateRun({ raw: atPace(1800), today: TODAY }))).toBe("pace_too_slow");
  });
});

describe("heart rate and its source", () => {
  it("accepts a reading with a source", () => {
    const result = validateRun({
      raw: raw({ avgHr: "148", hrSource: "strap" }),
      today: TODAY,
    });
    expect(result.ok && [result.run.avgHr, result.run.hrSource]).toEqual([148, "strap"]);
  });

  it("accepts neither, which is the common case", () => {
    const result = validateRun({ raw: raw(), today: TODAY });
    expect(result.ok && [result.run.avgHr, result.run.hrSource]).toEqual([null, null]);
  });

  it("refuses a reading without a source", () => {
    expect(outcome(validateRun({ raw: raw({ avgHr: "148" }), today: TODAY }))).toBe(
      "hr_source_missing",
    );
  });

  it("refuses a source without a reading, which would describe nothing", () => {
    expect(outcome(validateRun({ raw: raw({ hrSource: "wrist" }), today: TODAY }))).toBe(
      "hr_source_unexpected",
    );
  });

  it("refuses a source that is neither strap nor wrist", () => {
    expect(
      outcome(
        validateRun({ raw: raw({ avgHr: "148", hrSource: "optical" }), today: TODAY }),
      ),
    ).toBe("bad_hr_source");
  });

  it("refuses a reading that is not a whole number", () => {
    for (const avgHr of ["148.5", "abc"]) {
      expect(
        outcome(validateRun({ raw: raw({ avgHr, hrSource: "strap" }), today: TODAY })),
        avgHr,
      ).toBe("bad_hr");
    }
  });

  it("accepts both ends of the believable range and refuses outside it", () => {
    for (const avgHr of ["30", "250"]) {
      expect(
        outcome(validateRun({ raw: raw({ avgHr, hrSource: "strap" }), today: TODAY })),
        avgHr,
      ).toBe("ok");
    }
    for (const avgHr of ["29", "251"]) {
      expect(
        outcome(validateRun({ raw: raw({ avgHr, hrSource: "strap" }), today: TODAY })),
        avgHr,
      ).toBe("hr_range");
    }
  });
});

describe("the effort", () => {
  it("accepts 1 through 10", () => {
    for (let rpe = 1; rpe <= 10; rpe++) {
      expect(outcome(validateRun({ raw: raw({ rpe: String(rpe) }), today: TODAY }))).toBe(
        "ok",
      );
    }
  });

  it("refuses 0 and 11", () => {
    for (const rpe of ["0", "11"]) {
      expect(outcome(validateRun({ raw: raw({ rpe }), today: TODAY })), rpe).toBe(
        "rpe_range",
      );
    }
  });

  it("refuses an effort that is not a whole number", () => {
    expect(outcome(validateRun({ raw: raw({ rpe: "4.5" }), today: TODAY }))).toBe("bad_rpe");
  });
});

describe("the note", () => {
  it("refuses one over the limit, counted after trimming", () => {
    expect(
      outcome(validateRun({ raw: raw({ notes: "a".repeat(2001) }), today: TODAY })),
    ).toBe("notes_too_long");
  });

  it("accepts one exactly at the limit, and one padded past it with space", () => {
    expect(outcome(validateRun({ raw: raw({ notes: "a".repeat(2000) }), today: TODAY }))).toBe(
      "ok",
    );
    expect(
      outcome(validateRun({ raw: raw({ notes: ` ${"a".repeat(2000)} ` }), today: TODAY })),
    ).toBe("ok");
  });
});

describe("linking to a session", () => {
  const linked = raw({ plannedWorkoutId: "00000000-0000-4000-8000-000000000001" });

  it("says nothing when the session has no run yet", () => {
    expect(warnings(validateRun({ raw: linked, today: TODAY, linkedRuns: 0 }))).toEqual([]);
  });

  it("warns, rather than refuses, when the session already has one", () => {
    const result = validateRun({ raw: linked, today: TODAY, linkedRuns: 1 });
    expect(result.ok).toBe(true);
    expect(warnings(result)).toEqual(["workout_has_run"]);
  });

  it("carries how many are already there, so the sentence can say so", () => {
    const result = validateRun({ raw: linked, today: TODAY, linkedRuns: 2 });
    expect(result.ok && result.warnings[0]).toEqual({ code: "workout_has_run", runs: 2 });
  });

  it("says nothing about other runs when there is no session to share", () => {
    expect(warnings(validateRun({ raw: raw(), today: TODAY, linkedRuns: 3 }))).toEqual([]);
  });

  it("can carry a pace warning and a session warning at once", () => {
    const result = validateRun({
      // 1:30:00 over 10 km is 9:00 /km, past the 8:30 warning threshold.
      raw: { ...linked, distanceKm: "10", duration: "1:30:00" },
      today: TODAY,
      linkedRuns: 1,
    });
    expect(warnings(result)).toEqual(["pace_unusually_slow", "workout_has_run"]);
  });
});

describe("the code lists", () => {
  // Pinned, so adding a code is a deliberate change here and in the messages.
  it("names every reject code", () => {
    expect([...RUN_REJECT_CODES]).toEqual([
      "bad_date",
      "future_date",
      "bad_time",
      "bad_distance",
      "distance_range",
      "bad_duration",
      "duration_range",
      "pace_too_fast",
      "pace_too_slow",
      "bad_hr",
      "hr_range",
      "hr_source_missing",
      "hr_source_unexpected",
      "bad_hr_source",
      "bad_rpe",
      "rpe_range",
      "notes_too_long",
    ]);
  });

  it("names every warning code", () => {
    expect([...RUN_WARNING_CODES]).toEqual([
      "pace_unusually_fast",
      "pace_unusually_slow",
      "workout_has_run",
    ]);
  });
});
