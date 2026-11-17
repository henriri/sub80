import { describe, expect, it } from "vitest";
import { zoneRange, ZONE_KEYS } from "@/lib/plan";
import {
  RPE_BANDS,
  hrSourceChoices,
  hrSourceLabel,
  loggingForLine,
  paceVsZoneLine,
  rpeBandLabel,
  rpeBandsHint,
  rpeChoices,
  rpeLabel,
  runLoggedMessage,
  runRejectMessage,
  runUpdatedMessage,
  runWarningMessage,
  runWarningTitle,
} from "./messages";
import {
  HR_SOURCES,
  MAX_RPE,
  MIN_RPE,
  RUN_REJECT_CODES,
  RUN_WARNING_CODES,
  type RunReason,
  type RunWarning,
} from "./rules";
import { paceVsZone } from "./zone";

/*
 * One fixture per code. The Record type makes a missing fixture a tsc error,
 * and it.each over the exported code list makes a missing sentence a test
 * failure -- so adding a reason without copy cannot pass quietly.
 */
const reasons: Record<RunReason["code"], RunReason> = {
  bad_date: { code: "bad_date", value: "not a date" },
  future_date: { code: "future_date", date: "2027-12-02", today: "2027-12-01" },
  bad_time: { code: "bad_time", value: "morning" },
  bad_distance: { code: "bad_distance", value: "ten" },
  distance_range: { code: "distance_range", metres: 150_000, minM: 100, maxM: 100_000 },
  bad_duration: { code: "bad_duration", value: "ages" },
  duration_range: { code: "duration_range", seconds: 10, minS: 60, maxS: 43_200 },
  pace_too_fast: { code: "pace_too_fast", pace: 90, limit: 120 },
  pace_too_slow: { code: "pace_too_slow", pace: 1500, limit: 1200 },
  bad_hr: { code: "bad_hr", value: "148.5" },
  hr_range: { code: "hr_range", value: 300, min: 30, max: 250 },
  hr_source_missing: { code: "hr_source_missing" },
  hr_source_unexpected: { code: "hr_source_unexpected", value: "strap" },
  bad_hr_source: { code: "bad_hr_source", value: "optical" },
  bad_rpe: { code: "bad_rpe", value: "4.5" },
  rpe_range: { code: "rpe_range", value: 11, min: 1, max: 10 },
  notes_too_long: { code: "notes_too_long", max: 2000 },
};

const warnings: Record<RunWarning["code"], RunWarning> = {
  pace_unusually_fast: { code: "pace_unusually_fast", pace: 150, threshold: 180 },
  pace_unusually_slow: { code: "pace_unusually_slow", pace: 600, threshold: 510 },
  workout_has_run: { code: "workout_has_run", runs: 1 },
};

describe("runRejectMessage", () => {
  // Adding a reject code without copy fails here, not only in tsc.
  it.each(RUN_REJECT_CODES)("has a sentence for %s", (code) => {
    const message = runRejectMessage(reasons[code]);

    expect(message.length, code).toBeGreaterThan(0);
    expect(message, code).toMatch(/[.!?]$/);
  });

  it("never names a code, a column or a function in what the athlete reads", () => {
    for (const code of RUN_REJECT_CODES) {
      const message = runRejectMessage(reasons[code]);
      expect(message, code).not.toMatch(/_|validateRun|log_run|activities/);
    }
  });

  it("names the day rather than the raw date", () => {
    expect(runRejectMessage(reasons.future_date)).toBe("Thursday 2 December has not happened yet.");
  });

  it("says the distance bounds in kilometres, not metres", () => {
    expect(runRejectMessage(reasons.distance_range)).toBe(
      "A run is between 0.1 km and 100.0 km.",
    );
  });

  it("gives the derived pace back when the pace is impossible", () => {
    expect(runRejectMessage(reasons.pace_too_fast)).toContain("1:30 /km");
    expect(runRejectMessage(reasons.pace_too_slow)).toContain("25:00 /km");
  });

  it("explains the heart-rate pairing in both directions", () => {
    expect(runRejectMessage(reasons.hr_source_missing)).toContain("never mixed");
    expect(runRejectMessage(reasons.hr_source_unexpected)).toContain("clear the source");
  });
});

describe("runWarningMessage", () => {
  it.each(RUN_WARNING_CODES)("has a sentence for %s", (code) => {
    const message = runWarningMessage(warnings[code]);

    expect(message.length, code).toBeGreaterThan(0);
    expect(message, code).toMatch(/[.!?]$/);
  });

  it("asks about the field most likely to be wrong", () => {
    expect(runWarningMessage(warnings.pace_unusually_fast)).toContain("distance");
    expect(runWarningMessage(warnings.pace_unusually_slow)).toContain("time");
  });

  it("counts the runs already on the session", () => {
    expect(runWarningMessage({ code: "workout_has_run", runs: 1 })).toBe(
      "This session already has a run against it.",
    );
    expect(runWarningMessage({ code: "workout_has_run", runs: 2 })).toBe(
      "This session already has 2 runs against it.",
    );
  });
});

describe("runWarningTitle", () => {
  it("names the decision for a single warning", () => {
    expect(runWarningTitle([warnings.pace_unusually_fast])).toBe("Is that pace right?");
    expect(runWarningTitle([warnings.workout_has_run])).toBe(
      "Log a second run on this session?",
    );
  });

  it("names the shape of the decision when several apply at once", () => {
    expect(
      runWarningTitle([warnings.pace_unusually_slow, warnings.workout_has_run]),
    ).toBe("Save this run anyway?");
  });

  it("has a heading even with nothing to warn about", () => {
    expect(runWarningTitle([])).toBe("Save this run?");
  });

  it("ends every heading with a question mark, because each one asks something", () => {
    for (const code of RUN_WARNING_CODES) {
      expect(runWarningTitle([warnings[code]]), code).toMatch(/\?$/);
    }
  });
});

describe("hrSourceLabel", () => {
  it("says each source in full", () => {
    expect(hrSourceLabel("strap")).toBe("chest strap");
    expect(hrSourceLabel("wrist")).toBe("wrist");
  });

  it("has a label for every source", () => {
    for (const source of HR_SOURCES) {
      expect(hrSourceLabel(source).length, source).toBeGreaterThan(0);
    }
  });
});

describe("the effort scale", () => {
  it("covers 1 to 10 with no gap and no overlap", () => {
    const covered = RPE_BANDS.flatMap((band) =>
      Array.from({ length: band.to - band.from + 1 }, (_, i) => band.from + i),
    );

    expect(covered).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("uses the plain wording the brief asked for", () => {
    expect([1, 2, 3].map(rpeBandLabel)).toEqual(["easy", "easy", "easy"]);
    expect([4, 5, 6].map(rpeBandLabel)).toEqual(["moderate", "moderate", "moderate"]);
    expect([7, 8].map(rpeBandLabel)).toEqual(["hard", "hard"]);
    expect([9, 10].map(rpeBandLabel)).toEqual(["maximal", "maximal"]);
  });

  it("has a word for every score the rules allow", () => {
    for (let rpe = MIN_RPE; rpe <= MAX_RPE; rpe++) {
      expect(rpeBandLabel(rpe), String(rpe)).not.toBe("");
    }
  });

  it("reads a row as the score and its word", () => {
    expect(rpeLabel(5)).toBe("5 · moderate");
  });
});

describe("paceVsZoneLine", () => {
  const VDOT = 47;

  it("states the pace, the side and the window", () => {
    const { fast, slow } = zoneRange("E", VDOT);
    const middle = (fast + slow) / 2;
    const line = paceVsZoneLine(paceVsZone(middle, "E", VDOT), "E");

    // The shape the brief asked for: "5:38/km, within your Easy range ...".
    expect(line).toMatch(/^\d+:\d{2} \/km, within your Easy range \d+:\d{2} to \d+:\d{2}\.$/);
  });

  it("words all three verdicts", () => {
    const { fast, slow } = zoneRange("T", VDOT);

    expect(paceVsZoneLine(paceVsZone(fast - 20, "T", VDOT), "T")).toContain("faster than");
    expect(paceVsZoneLine(paceVsZone(slow + 20, "T", VDOT), "T")).toContain("slower than");
    expect(paceVsZoneLine(paceVsZone(slow, "T", VDOT), "T")).toContain("within");
  });

  it("uses the zone's own name, for every zone the plan can store", () => {
    for (const key of ZONE_KEYS) {
      const line = paceVsZoneLine(paceVsZone(300, key, VDOT), key);
      expect(line, key).toMatch(/[.]$/);
      expect(line.length, key).toBeGreaterThan(0);
    }
  });

  it("is a statement and never a judgement", () => {
    const words = /good|bad|well done|poor|should|failed|target missed/i;
    for (const key of ZONE_KEYS) {
      expect(paceVsZoneLine(paceVsZone(300, key, VDOT), key), key).not.toMatch(words);
    }
  });
});

describe("the sentences after a run is saved", () => {
  it("says what was logged, and where", () => {
    expect(runLoggedMessage("2027-11-20", 10_000)).toBe(
      "10.0 km logged on Saturday 20 November.",
    );
  });

  it("says an edit was saved rather than logged", () => {
    expect(runUpdatedMessage("2027-11-20", 7500)).toBe(
      "7.5 km on Saturday 20 November saved.",
    );
  });

});

describe("the choice groups", () => {
  it("offers ten effort segments, in order", () => {
    const choices = rpeChoices();

    expect(choices).toHaveLength(10);
    expect(choices.map((choice) => choice.value)).toEqual([
      "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
    ]);
  });

  /*
   * The segment shows a bare number because ten words will not fit a phone.
   * The word has to reach a screen reader anyway, or the scale is a row of
   * digits nobody explained.
   */
  it("speaks each effort with its word, while showing only the number", () => {
    const choices = rpeChoices();

    expect(choices[0]).toEqual({ value: "1", label: "1", spokenLabel: "1, easy" });
    expect(choices[4]).toEqual({ value: "5", label: "5", spokenLabel: "5, moderate" });
    expect(choices[9]).toEqual({ value: "10", label: "10", spokenLabel: "10, maximal" });
  });

  it("gives every effort a spoken label", () => {
    for (const choice of rpeChoices()) {
      expect(choice.spokenLabel, choice.value).toMatch(/^\d+, \w+$/);
    }
  });

  it("sums up the scale in one line", () => {
    expect(rpeBandsHint()).toBe("1–3 easy · 4–6 moderate · 7–8 hard · 9–10 maximal");
  });

  it("offers exactly the two heart-rate sources, named in full", () => {
    expect(hrSourceChoices()).toEqual([
      { value: "strap", label: "Chest strap" },
      { value: "wrist", label: "Wrist" },
    ]);
  });

  it("keeps the two sources in step with the ones the rules allow", () => {
    expect(hrSourceChoices().map((choice) => choice.value)).toEqual([...HR_SOURCES]);
  });
});

describe("loggingForLine", () => {
  const session = {
    title: "Easy",
    planned_date: "2027-03-18",
    target_distance_m: 8_000,
  };

  it("says the day, the session and the distance it asks for", () => {
    expect(loggingForLine(session)).toBe("Thu 18 Mar · Easy · 8.0 km");
  });

  it("leaves the distance off a session that asks for none", () => {
    expect(loggingForLine({ ...session, target_distance_m: null })).toBe(
      "Thu 18 Mar · Easy",
    );
  });

  it("is a statement, with nothing in it that reads as a question", () => {
    // The choice was made by pressing Log run on the session. This only says
    // which session the form heard.
    expect(loggingForLine(session)).not.toMatch(/\?/);
  });
});
