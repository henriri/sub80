import { describe, expect, it } from "vitest";
import type { StoredRun } from "./schemas";
import {
  NOTES_EXCERPT_LENGTH,
  RUNS_PER_PAGE,
  buildRunList,
  excerpt,
  toRunRow,
} from "./view-model";

let nextId = 1;

function run(overrides: Partial<StoredRun> = {}): StoredRun {
  const id = String(nextId++).padStart(12, "0");
  return {
    id: `00000000-0000-4000-8000-${id}`,
    // 07:30 Paris on a November morning, which is 06:30 UTC.
    started_at: "2027-11-20T06:30:00Z",
    start_time_known: true,
    distance_m: 10_000,
    duration_s: 3000,
    avg_hr: null,
    hr_source: null,
    rpe: null,
    notes: null,
    planned_pace_zone: null,
    vdot_used: null,
    source: "manual",
    planned_workout_id: null,
    planned_workout: null,
    ...overrides,
  };
}

describe("toRunRow", () => {
  it("derives the Paris date from the stored instant", () => {
    const row = toRunRow(run());

    expect(row.date).toBe("2027-11-20");
    expect(row.dateLabel).toBe("Sat 20 Nov");
    expect(row.fullDateLabel).toBe("Saturday 20 November 2027");
  });

  it("shows the start time when it is real", () => {
    expect(toRunRow(run()).startTimeLabel).toBe("07:30");
  });

  /*
   * A run with no entered time is stored at midday Paris so that it has an
   * instant at all. Showing "12:00" would be presenting the placeholder as a
   * fact the athlete gave, which is exactly what start_time_known prevents.
   */
  it("shows no start time when none was entered, rather than the midday placeholder", () => {
    const row = toRunRow(
      run({ started_at: "2027-11-20T11:00:00Z", start_time_known: false }),
    );

    expect(row.startTimeLabel).toBeNull();
    expect(row.date).toBe("2027-11-20");
  });

  it("labels the distance, the time and the derived pace", () => {
    const row = toRunRow(run({ distance_m: 7500, duration_s: 2550 }));

    expect([row.distanceLabel, row.timeLabel, row.paceLabel]).toEqual([
      "7.5 km",
      "42:30",
      "5:40 /km",
    ]);
  });

  it("shows an hour-long run as h:mm:ss", () => {
    expect(toRunRow(run({ duration_s: 5025 })).timeLabel).toBe("1:23:45");
  });

  it("scores the effort with its plain word, or nothing at all", () => {
    expect(toRunRow(run({ rpe: 5 })).rpeLabel).toBe("5 · moderate");
    expect(toRunRow(run()).rpeLabel).toBeNull();
  });

  /*
   * The source is a separate field, never folded into the number, because the
   * two sources are never mixed or averaged: a row has to be able to say which
   * one it is before anything compares it to another row.
   */
  it("keeps the heart rate and its source apart, and shows which source it was", () => {
    const strap = toRunRow(run({ avg_hr: 148, hr_source: "strap" }));
    expect([strap.hrLabel, strap.hrSourceLabel]).toEqual(["148 bpm", "chest strap"]);

    const wrist = toRunRow(run({ avg_hr: 151, hr_source: "wrist" }));
    expect([wrist.hrLabel, wrist.hrSourceLabel]).toEqual(["151 bpm", "wrist"]);
  });

  it("shows neither when there was no heart rate", () => {
    const row = toRunRow(run());
    expect([row.hrLabel, row.hrSourceLabel]).toEqual([null, null]);
  });

  it("links to its own page, and to the session when there is one", () => {
    const plain = toRunRow(run());
    expect(plain.href).toBe(`/runs/${plain.id}`);
    expect([plain.workoutTitle, plain.workoutHref]).toEqual([null, null]);

    const linked = toRunRow(
      run({
        planned_workout_id: "00000000-0000-4000-8000-0000000000aa",
        planned_workout: {
          title: "Threshold 3 × 12′",
          planned_date: "2027-11-20",
          pace_zone: "T",
          status: "completed",
        },
      }),
    );
    expect(linked.workoutTitle).toBe("Threshold 3 × 12′");
    expect(linked.workoutHref).toBe("/workouts/00000000-0000-4000-8000-0000000000aa");
  });

  it("states the zone line from the run's own snapshots", () => {
    const row = toRunRow(run({ planned_pace_zone: "E", vdot_used: 47 }));

    expect(row.zoneLine).toMatch(/^5:00 \/km, (within|faster than|slower than) your Easy range/);
  });

  /*
   * The point of taking both snapshots together. A zone with no VDOT cannot be
   * turned back into a pace window, so there is no factual line to write and
   * the row says nothing rather than guessing at today's fitness.
   */
  it("says nothing about the zone when either snapshot is missing", () => {
    expect(toRunRow(run({ planned_pace_zone: "E", vdot_used: null })).zoneLine).toBeNull();
    expect(toRunRow(run({ planned_pace_zone: null, vdot_used: 47 })).zoneLine).toBeNull();
    expect(toRunRow(run()).zoneLine).toBeNull();
  });

  it("judges the run against the VDOT stored on it, not a current one", () => {
    const old = toRunRow(run({ planned_pace_zone: "E", vdot_used: 47 }));
    const fit = toRunRow(run({ planned_pace_zone: "E", vdot_used: 58.4 }));

    // Same 5:00 /km, two different verdicts, because the window moved.
    expect(old.zoneLine).not.toBe(fit.zoneLine);
  });
});

describe("excerpt", () => {
  it("leaves a short note alone", () => {
    expect(excerpt("Legs heavy.")).toBe("Legs heavy.");
  });

  it("collapses the whitespace a textarea leaves behind", () => {
    expect(excerpt("  Legs\n\nheavy   today.  ")).toBe("Legs heavy today.");
  });

  it("cuts a long note on a word and marks that it was cut", () => {
    const note = `${"word ".repeat(40)}end`;
    const cut = excerpt(note);

    expect(cut.length).toBeLessThanOrEqual(NOTES_EXCERPT_LENGTH + 1);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut).not.toContain("wor…");
  });

  it("cuts mid-word rather than returning almost nothing", () => {
    // One unbroken word: there is no word boundary to prefer.
    const cut = excerpt("a".repeat(200));

    expect(cut).toBe(`${"a".repeat(NOTES_EXCERPT_LENGTH)}…`);
  });

  it("does not cut a note that is exactly at the limit", () => {
    const note = "a".repeat(NOTES_EXCERPT_LENGTH);
    expect(excerpt(note)).toBe(note);
  });
});

describe("buildRunList", () => {
  const rows = (count: number) => Array.from({ length: count }, () => run());

  it("shows an empty page without inventing anything", () => {
    expect(buildRunList({ rows: [], page: 1 })).toEqual({
      runs: [],
      page: 1,
      hasPrev: false,
      hasNext: false,
    });
  });

  it("has no previous page on the first one", () => {
    expect(buildRunList({ rows: rows(5), page: 1 }).hasPrev).toBe(false);
  });

  it("has a previous page on any later one", () => {
    expect(buildRunList({ rows: rows(5), page: 2 }).hasPrev).toBe(true);
  });

  /*
   * The data layer reads RUNS_PER_PAGE + 1 rows so that "is there more" is
   * answered by the read itself rather than a second count query. The extra
   * row is what tells us, and it must not be rendered.
   */
  it("reports a next page from the extra row, and does not show it", () => {
    const model = buildRunList({ rows: rows(RUNS_PER_PAGE + 1), page: 1 });

    expect(model.hasNext).toBe(true);
    expect(model.runs).toHaveLength(RUNS_PER_PAGE);
  });

  it("reports no next page on an exactly full one", () => {
    const model = buildRunList({ rows: rows(RUNS_PER_PAGE), page: 1 });

    expect(model.hasNext).toBe(false);
    expect(model.runs).toHaveLength(RUNS_PER_PAGE);
  });

  it("keeps the order the rows came in, which is newest first", () => {
    const given = [
      run({ started_at: "2027-11-20T06:30:00Z" }),
      run({ started_at: "2027-11-18T06:30:00Z" }),
      run({ started_at: "2027-11-15T06:30:00Z" }),
    ];

    expect(buildRunList({ rows: given, page: 1 }).runs.map((r) => r.date)).toEqual([
      "2027-11-20",
      "2027-11-18",
      "2027-11-15",
    ]);
  });

  it("shows twenty runs to a page", () => {
    expect(RUNS_PER_PAGE).toBe(20);
  });
});
