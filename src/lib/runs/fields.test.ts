import { describe, expect, it } from "vitest";
import { RUN_FIELDS, reasonField, type RunField } from "./fields";
import { RUN_REJECT_CODES, type RunReason } from "./rules";

const reasons: Record<RunReason["code"], RunReason> = {
  bad_date: { code: "bad_date", value: "x" },
  future_date: { code: "future_date", date: "2027-12-02", today: "2027-12-01" },
  bad_time: { code: "bad_time", value: "x" },
  bad_distance: { code: "bad_distance", value: "x" },
  distance_range: { code: "distance_range", metres: 1, minM: 100, maxM: 100_000 },
  bad_duration: { code: "bad_duration", value: "x" },
  duration_range: { code: "duration_range", seconds: 1, minS: 60, maxS: 43_200 },
  pace_too_fast: { code: "pace_too_fast", pace: 90, limit: 120 },
  pace_too_slow: { code: "pace_too_slow", pace: 1500, limit: 1200 },
  bad_hr: { code: "bad_hr", value: "x" },
  hr_range: { code: "hr_range", value: 300, min: 30, max: 250 },
  hr_source_missing: { code: "hr_source_missing" },
  hr_source_unexpected: { code: "hr_source_unexpected", value: "x" },
  bad_hr_source: { code: "bad_hr_source", value: "x" },
  bad_rpe: { code: "bad_rpe", value: "x" },
  rpe_range: { code: "rpe_range", value: 11, min: 1, max: 10 },
  notes_too_long: { code: "notes_too_long", max: 2000 },
};

describe("reasonField", () => {
  // Adding a reject code without routing it fails here, not only in tsc.
  it.each(RUN_REJECT_CODES)("routes %s to a field that exists", (code) => {
    expect(RUN_FIELDS, code).toContain(reasonField(reasons[code]));
  });

  it("puts each refusal under the control it is about", () => {
    const routed: Record<RunReason["code"], RunField> = {
      bad_date: "date",
      future_date: "date",
      bad_time: "time",
      bad_distance: "distanceKm",
      distance_range: "distanceKm",
      bad_duration: "duration",
      duration_range: "duration",
      pace_too_fast: "pace",
      pace_too_slow: "pace",
      bad_hr: "avgHr",
      hr_range: "avgHr",
      hr_source_missing: "hrSource",
      hr_source_unexpected: "hrSource",
      bad_hr_source: "hrSource",
      bad_rpe: "rpe",
      rpe_range: "rpe",
      notes_too_long: "notes",
    };

    for (const code of RUN_REJECT_CODES) {
      expect(reasonField(reasons[code]), code).toBe(routed[code]);
    }
  });

  /*
   * The pace is not an input. It comes from the distance and the time, and
   * neither is wrong on its own, so blaming one of them would send the athlete
   * to correct a field that may well be right.
   */
  it("blames neither input for a pace that cannot be, and says so beside the pace", () => {
    expect(reasonField(reasons.pace_too_fast)).toBe("pace");
    expect(reasonField(reasons.pace_too_slow)).toBe("pace");
  });

  it("names a field for every code, and uses every field it names", () => {
    const used = new Set(RUN_REJECT_CODES.map((code) => reasonField(reasons[code])));

    // Every field in the list is reachable by some refusal: an unreachable one
    // would be a slot the form renders and nothing ever fills.
    expect([...used].sort()).toEqual([...RUN_FIELDS].sort());
  });
});
