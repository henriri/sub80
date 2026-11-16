import { describe, expect, it } from "vitest";
import { ZONE_KEYS, zoneRange, type ZoneKey } from "@/lib/plan";
import { paceVsZone } from "./zone";

/** Where the plan starts. A 1:20 half is about 58.4, so this is the low end. */
const VDOT = 47;

describe("paceVsZone", () => {
  it("reports the window it compared against, unchanged from zoneRange", () => {
    const expected = zoneRange("E", VDOT);
    const result = paceVsZone(expected.slow, "E", VDOT);

    expect([result.fast, result.slow]).toEqual([expected.fast, expected.slow]);
  });

  it("calls a pace inside the window within", () => {
    const { fast, slow } = zoneRange("E", VDOT);
    const middle = (fast + slow) / 2;

    expect(paceVsZone(middle, "E", VDOT)).toEqual({
      verdict: "within",
      pace: middle,
      fast,
      slow,
      deltaSec: 0,
    });
  });

  /*
   * Both edges count as within. A session showing "5:30 to 6:15" and run at
   * exactly 6:15 did what it asked; excluding the boundary would make the real
   * window narrower than the one the athlete was shown.
   */
  it("counts both edges as within, for every zone", () => {
    for (const key of ZONE_KEYS) {
      const { fast, slow } = zoneRange(key, VDOT);
      expect(paceVsZone(fast, key, VDOT).verdict, `${key} fast edge`).toBe("within");
      expect(paceVsZone(slow, key, VDOT).verdict, `${key} slow edge`).toBe("within");
    }
  });

  it("calls anything past the fast edge faster, for every zone", () => {
    for (const key of ZONE_KEYS) {
      const { fast } = zoneRange(key, VDOT);
      const result = paceVsZone(fast - 1, key, VDOT);

      expect(result.verdict, key).toBe("faster");
      expect(result.deltaSec, key).toBeCloseTo(-1, 9);
    }
  });

  it("calls anything past the slow edge slower, for every zone", () => {
    for (const key of ZONE_KEYS) {
      const { slow } = zoneRange(key, VDOT);
      const result = paceVsZone(slow + 1, key, VDOT);

      expect(result.verdict, key).toBe("slower");
      expect(result.deltaSec, key).toBeCloseTo(1, 9);
    }
  });

  it("signs the gap so that more positive is always slower", () => {
    const { fast, slow } = zoneRange("T", VDOT);

    expect(paceVsZone(fast - 12, "T", VDOT).deltaSec).toBeCloseTo(-12, 9);
    expect(paceVsZone(slow + 12, "T", VDOT).deltaSec).toBeCloseTo(12, 9);
  });

  it("carries race pace for a race key and omits it for a training zone", () => {
    const race = paceVsZone(240, "5K", VDOT);
    expect(race.mid).toBe(zoneRange("5K", VDOT).mid);

    expect(paceVsZone(300, "E", VDOT)).not.toHaveProperty("mid");
  });

  it("moves the window when the VDOT does, which is why it is an argument", () => {
    // Fitter means a faster window, so one unchanged pace changes verdict.
    // 5:00 /km is quicker than easy running at VDOT 47, and easy at 58.4.
    const fit = paceVsZone(300, "E", 58.4);
    const less = paceVsZone(300, "E", 47);

    expect(fit.fast).toBeLessThan(less.fast);
    expect([less.verdict, fit.verdict]).toEqual(["faster", "within"]);
  });

  /*
   * The whole point of activities.vdot_used. A run logged a year ago was aimed
   * at the paces of its own day, so judging it against today's fitness would
   * quietly rewrite what it was asked to be.
   */
  it("judges an old run against the VDOT of its own day", () => {
    const pace = 330;
    const thenVerdict = paceVsZone(pace, "E", 47).verdict;
    const nowVerdict = paceVsZone(pace, "E", 58.4).verdict;

    expect(thenVerdict).toBe("within");
    expect(nowVerdict).toBe("slower");
  });

  it("is a comparison and nothing else: no score, no effort, no grade", () => {
    const result = paceVsZone(300, "E", VDOT);
    const keys = Object.keys(result).sort();

    expect(keys).toEqual(["deltaSec", "fast", "pace", "slow", "verdict"]);
  });

  it("handles an infinite pace without inventing a verdict", () => {
    // paceSecPerKm is infinite without a distance. validateRun refuses such a
    // run long before this, but the function must not return nonsense.
    const result = paceVsZone(Number.POSITIVE_INFINITY, "E", VDOT);
    expect(result.verdict).toBe("slower");
  });

  it("covers every zone key the plan can store", () => {
    const keys: readonly ZoneKey[] = ZONE_KEYS;
    for (const key of keys) {
      expect(paceVsZone(300, key, VDOT).verdict, key).toMatch(/^(faster|within|slower)$/);
    }
  });
});
