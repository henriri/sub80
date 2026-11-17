import { describe, expect, it } from "vitest";
import {
  chosenWorkoutSchema,
  linkableWorkoutSchema,
  storedRunSchema,
} from "./schemas";

const row = {
  id: "00000000-0000-4000-8000-000000000001",
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
};

const session = {
  title: "Threshold 3 × 12′",
  planned_date: "2027-11-20",
  pace_zone: "T",
  status: "completed",
};

describe("storedRunSchema", () => {
  it("reads a plain unlinked row", () => {
    expect(storedRunSchema.parse(row).planned_workout).toBeNull();
  });

  /*
   * planned_workout_id is half of a composite foreign key, and whether
   * PostgREST calls that a to-one (an object) or a to-many (an array of one)
   * cannot be checked here: CI runs migrations and pgTAP, neither of which
   * goes through PostgREST. Both shapes are accepted so a correct row from the
   * database cannot fail on the way in.
   */
  it("accepts the embedded session as an object", () => {
    const parsed = storedRunSchema.parse({ ...row, planned_workout: session });
    expect(parsed.planned_workout?.title).toBe("Threshold 3 × 12′");
  });

  it("accepts the embedded session as an array of one, and flattens it", () => {
    const parsed = storedRunSchema.parse({ ...row, planned_workout: [session] });
    expect(parsed.planned_workout?.title).toBe("Threshold 3 × 12′");
  });

  it("reads an empty array as no session", () => {
    expect(storedRunSchema.parse({ ...row, planned_workout: [] }).planned_workout).toBeNull();
  });

  it("still refuses an embedded session that is missing its title", () => {
    expect(() =>
      storedRunSchema.parse({ ...row, planned_workout: { ...session, title: "" } }),
    ).toThrow();
  });

  /** numeric(4,1) arrives as a number or a string depending on the client. */
  it("reads vdot_used however the client types it", () => {
    expect(storedRunSchema.parse({ ...row, vdot_used: "52.3" }).vdot_used).toBe(52.3);
    expect(storedRunSchema.parse({ ...row, vdot_used: 52.3 }).vdot_used).toBe(52.3);
  });

  it("keeps a missing vdot_used null rather than coercing it to zero", () => {
    expect(storedRunSchema.parse({ ...row, vdot_used: null }).vdot_used).toBeNull();
  });

  it("refuses a heart-rate source outside the two", () => {
    expect(() =>
      storedRunSchema.parse({ ...row, avg_hr: 150, hr_source: "optical" }),
    ).toThrow();
  });
});

describe("chosenWorkoutSchema", () => {
  const row = {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Easy",
    planned_date: "2027-03-18",
    pace_zone: "E",
    status: "planned",
    target_distance_m: 8_000,
    run_count: 0,
    notes: "Calves were tight on Tuesday. Keep it honest.",
  };

  it("carries the session's own note, which the picker's rows do not", () => {
    expect(chosenWorkoutSchema.parse(row).notes).toBe(row.notes);
  });

  it("accepts a session with no note", () => {
    expect(chosenWorkoutSchema.parse({ ...row, notes: null }).notes).toBeNull();
  });

  it("is otherwise a linkable session, so the form takes it as one", () => {
    // Same shape the picker reads, so `lockedSession` needs no second type.
    const chosen = chosenWorkoutSchema.parse(row);
    expect(linkableWorkoutSchema.parse(chosen)).toEqual({
      id: chosen.id,
      title: chosen.title,
      planned_date: chosen.planned_date,
      pace_zone: chosen.pace_zone,
      status: chosen.status,
      target_distance_m: chosen.target_distance_m,
      run_count: chosen.run_count,
    });
  });
});
