import { describe, expect, it } from "vitest";
import { RUN_SOURCES, type ParsedRun } from "./rules";
import {
  MEASURED_FIELDS,
  OWN_FIELDS,
  isStatsLocked,
  refusesStatsEdit,
  statsChanged,
  type StoredStats,
} from "./source-guard";

const stored: StoredStats = {
  date: "2027-03-16",
  time: "07:30",
  distanceM: 14_200,
  durationS: 3_600,
  avgHr: 158,
  hrSource: "strap",
};

/** The same run as the form would re-send it, unchanged. */
const resend = (overrides: Partial<ParsedRun> = {}): ParsedRun => ({
  date: stored.date,
  time: stored.time,
  distanceM: stored.distanceM,
  durationS: stored.durationS,
  paceSecPerKm: 253,
  avgHr: stored.avgHr,
  hrSource: "strap",
  rpe: 7,
  notes: null,
  plannedWorkoutId: null,
  ...overrides,
});

describe("isStatsLocked", () => {
  it("leaves a run entered by hand entirely the athlete's", () => {
    expect(isStatsLocked("manual")).toBe(false);
  });

  it("locks every import path, because the device is the record", () => {
    for (const source of RUN_SOURCES.filter((name) => name !== "manual")) {
      expect(isStatsLocked(source), source).toBe(true);
    }
  });

  it("covers every source the column allows", () => {
    // A fifth source would otherwise arrive unlocked by default.
    expect([...RUN_SOURCES]).toEqual(["manual", "fit_upload", "polar", "wahoo"]);
  });
});

describe("statsChanged", () => {
  it("is false for an unchanged resend, which is what makes an edit possible", () => {
    // The form posts every field on every submit, so changing only the note
    // sends the distance back untouched. That has to succeed.
    expect(statsChanged(resend(), stored)).toBe(false);
  });

  it("ignores the fields that are the athlete's own", () => {
    expect(
      statsChanged(
        resend({ rpe: 2, notes: "Felt heavy.", plannedWorkoutId: "a" }),
        stored,
      ),
    ).toBe(false);
  });

  it("sees a change to any measurement", () => {
    const changes: Partial<ParsedRun>[] = [
      { date: "2027-03-15" },
      { time: "08:00" },
      { time: null },
      { distanceM: 14_300 },
      { durationS: 3_601 },
      { avgHr: 159 },
      { avgHr: null, hrSource: null },
      { hrSource: "wrist" },
    ];

    for (const change of changes) {
      expect(statsChanged(resend(change), stored), JSON.stringify(change)).toBe(true);
    }
  });

  it("treats a missing start time as a value, not as nothing", () => {
    // A run filed without a start time renders an empty field and posts one
    // back. Null against null is unchanged; null against 07:30 is an edit.
    const noTime: StoredStats = { ...stored, time: null };

    expect(statsChanged(resend({ time: null }), noTime)).toBe(false);
    expect(statsChanged(resend({ time: "07:30" }), noTime)).toBe(true);
  });

  it("treats a missing heart rate as a value too", () => {
    const noHr: StoredStats = { ...stored, avgHr: null, hrSource: null };

    expect(statsChanged(resend({ avgHr: null, hrSource: null }), noHr)).toBe(false);
    expect(statsChanged(resend(), noHr)).toBe(true);
  });
});

describe("refusesStatsEdit", () => {
  it("refuses an imported run whose measurements would change", () => {
    expect(refusesStatsEdit("fit_upload", resend({ distanceM: 15_000 }), stored)).toBe(
      true,
    );
  });

  it("allows an imported run's own note, effort and link to change", () => {
    expect(
      refusesStatsEdit(
        "fit_upload",
        resend({ rpe: 3, notes: "Easier than it looked.", plannedWorkoutId: "a" }),
        stored,
      ),
    ).toBe(false);
  });

  it("allows an unchanged resend of an imported run", () => {
    expect(refusesStatsEdit("polar", resend(), stored)).toBe(false);
  });

  it("refuses nothing on a run entered by hand", () => {
    expect(
      refusesStatsEdit("manual", resend({ distanceM: 1_000, avgHr: null, hrSource: null }), stored),
    ).toBe(false);
  });
});

describe("the two field lists", () => {
  it("name the measurements and the athlete's own, with no overlap", () => {
    expect([...MEASURED_FIELDS]).toEqual([
      "date",
      "time",
      "distanceKm",
      "duration",
      "avgHr",
      "hrSource",
    ]);
    expect([...OWN_FIELDS]).toEqual(["rpe", "notes", "plannedWorkoutId"]);

    const overlap = MEASURED_FIELDS.filter((name) =>
      (OWN_FIELDS as readonly string[]).includes(name),
    );
    expect(overlap).toEqual([]);
  });
});
