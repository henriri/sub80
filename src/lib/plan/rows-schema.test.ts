import { describe, expect, it } from "vitest";
import { storedWorkoutWithRunsSchema } from "./rows-schema";

const session = {
  id: "00000000-0000-4000-8000-000000000001",
  generated_key: "w22-d1",
  planned_date: "2027-03-16",
  kind: "threshold",
  title: "Threshold 3 × 12′",
  is_key: true,
  target_distance_m: 14_000,
  week_index: 22,
  pace_zone: "T",
  strides: false,
  status: "completed",
  day_slot: 0,
};

const run = {
  id: "00000000-0000-4000-8000-00000000000a",
  started_at: "2027-03-16T17:00:00Z",
  distance_m: 14_200,
  duration_s: 3_600,
  avg_hr: 158,
  hr_source: "strap",
  rpe: 7,
};

const parse = (runs: unknown) =>
  storedWorkoutWithRunsSchema.parse({ ...session, runs });

/*
 * `activities.planned_workout_id` is half of a COMPOSITE foreign key, and
 * whether PostgREST infers it as a to-many or a to-one is not something this
 * repo can check: the `database` CI job runs the migrations and the pgTAP
 * tests, neither of which goes through PostgREST at all. So both shapes are
 * accepted, exactly as storedRunSchema does for the embed in the other
 * direction, and these are the cases that normalising has to cover.
 */
describe("storedWorkoutWithRunsSchema", () => {
  it("takes the to-many shape: an array of runs", () => {
    expect(parse([run]).runs).toEqual([run]);
  });

  it("takes the to-one shape: a single run as an object", () => {
    expect(parse(run).runs).toEqual([run]);
  });

  it("reads an empty array as no run logged", () => {
    expect(parse([]).runs).toEqual([]);
  });

  it("reads a null embed as no run logged, not as a missing column", () => {
    expect(parse(null).runs).toEqual([]);
  });

  it("reads an absent embed as no run logged", () => {
    expect(storedWorkoutWithRunsSchema.parse(session).runs).toEqual([]);
  });

  it("takes several runs on one session, which is legitimate", () => {
    const second = { ...run, id: "00000000-0000-4000-8000-00000000000b" };
    expect(parse([run, second]).runs).toHaveLength(2);
  });

  it("keeps the heart rate and its source together, or neither", () => {
    expect(parse([{ ...run, avg_hr: null, hr_source: null }]).runs[0]?.avg_hr).toBeNull();
  });

  it("refuses a run that is not a run, rather than guessing", () => {
    // The row crossed a boundary. A malformed embed is a fault to surface, not
    // something to render half of.
    expect(() => parse([{ ...run, duration_s: 0 }])).toThrow();
    expect(() => parse([{ ...run, id: "not-a-uuid" }])).toThrow();
  });

  it("still is a stored workout, so the move rules read it unchanged", () => {
    const parsed = parse([run]);
    expect(parsed.status).toBe("completed");
    expect(parsed.day_slot).toBe(0);
    expect(parsed.target_distance_m).toBe(14_000);
  });
});
