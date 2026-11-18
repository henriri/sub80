import { describe, expect, it } from "vitest";
import { actualOverPlanned, doneFacts, type DoneRun } from "./done";

function logged(overrides: Partial<DoneRun> = {}): DoneRun {
  return {
    distance_m: 8_200,
    duration_s: 2_460,
    avg_hr: null,
    hr_source: null,
    rpe: null,
    ...overrides,
  };
}

describe("doneFacts", () => {
  it("is null when nothing was logged, because there is nothing to report", () => {
    // Not an empty summary: "no run" is the state a card shows a PLAN for.
    expect(doneFacts([])).toBeNull();
  });

  it("states the distance, the time and the pace of one run", () => {
    const facts = doneFacts([logged()]);

    expect(facts).not.toBeNull();
    expect(facts?.runs).toBe(1);
    expect(facts?.metres).toBe(8_200);
    expect(facts?.distanceLabel).toBe("8.2 km");
    expect(facts?.timeLabel).toBe("41:00");
    expect(facts?.paceLabel).toBe("5:00 /km");
  });

  it("names the heart rate's source, which is never implied", () => {
    const facts = doneFacts([logged({ avg_hr: 148, hr_source: "strap" })]);

    expect(facts?.hrLabel).toBe("148 bpm");
    expect(facts?.hrSourceLabel).toBe("chest strap");
  });

  it("says the effort as the athlete scored it", () => {
    expect(doneFacts([logged({ rpe: 4 })])?.rpeLabel).toBe("4 · moderate");
  });

  it("leaves out what was not recorded", () => {
    const facts = doneFacts([logged()]);

    expect(facts?.hrLabel).toBeNull();
    expect(facts?.hrSourceLabel).toBeNull();
    expect(facts?.rpeLabel).toBeNull();
  });

  describe("two runs on one session, which is legitimate", () => {
    const runs = [
      logged({ distance_m: 6_000, duration_s: 1_800, avg_hr: 150, hr_source: "strap", rpe: 5 }),
      logged({ distance_m: 4_000, duration_s: 1_320, avg_hr: 130, hr_source: "wrist", rpe: 2 }),
    ];

    it("sums the distance and the time", () => {
      const facts = doneFacts(runs);

      expect(facts?.runs).toBe(2);
      expect(facts?.metres).toBe(10_000);
      expect(facts?.distanceLabel).toBe("10.0 km");
      expect(facts?.timeLabel).toBe("52:00");
      // The pace of the whole day: 3120s over 10 km.
      expect(facts?.paceLabel).toBe("5:12 /km");
    });

    it("leaves the heart rate off rather than averaging two sources", () => {
      // A strap reading and a wrist reading are never mixed or averaged. The
      // session's own page lists each run in full instead.
      const facts = doneFacts(runs);

      expect(facts?.hrLabel).toBeNull();
      expect(facts?.hrSourceLabel).toBeNull();
    });

    it("leaves the effort off too: two scores have no meaningful mean", () => {
      expect(doneFacts(runs)?.rpeLabel).toBeNull();
    });

    it("withholds the heart rate even when both runs used the same source", () => {
      const sameSource = runs.map((run) => ({ ...run, hr_source: "strap" as const }));
      expect(doneFacts(sameSource)?.hrLabel).toBeNull();
    });
  });
});

describe("actualOverPlanned", () => {
  it("states what was run over what was asked for, with one unit", () => {
    expect(actualOverPlanned(8_200, 8_000)).toBe("8.2 / 8.0 km");
  });

  it("passes no verdict: a short day reads exactly like a long one", () => {
    expect(actualOverPlanned(6_000, 8_000)).toBe("6.0 / 8.0 km");
    expect(actualOverPlanned(10_000, 8_000)).toBe("10.0 / 8.0 km");
  });

  it("is the distance alone when the session asked for none", () => {
    expect(actualOverPlanned(8_200, null)).toBe("8.2 km");
  });
});
