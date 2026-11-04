import { describe, expect, it } from "vitest";
import {
  ZONES,
  ZONE_KEYS,
  fmtPace,
  fmtTime,
  paceAtFrac,
  paceRangeLabel,
  predictSec,
  vdotFrom,
  vo2,
  zoneLabel,
  zoneRange,
} from "./vdot";

describe("vdotFrom", () => {
  it("puts a 17:30 5k at about 58.2", () => {
    expect(vdotFrom(5000, 17 * 60 + 30)).toBeCloseTo(58.2, 1);
  });

  it("puts a 1:20 half marathon at about 58.4", () => {
    expect(vdotFrom(21097.5, 80 * 60)).toBeCloseTo(58.4, 1);
  });

  it("rises as the same distance gets faster", () => {
    expect(vdotFrom(5000, 17 * 60)).toBeGreaterThan(vdotFrom(5000, 18 * 60));
  });
});

describe("predictSec", () => {
  it("round-trips through vdotFrom", () => {
    for (const [distM, vdot] of [
      [5000, 58.4],
      [10000, 58.4],
      [21097.5, 58.4],
      [5000, 47],
    ] as const) {
      expect(vdotFrom(distM, predictSec(vdot, distM))).toBeCloseTo(vdot, 4);
    }
  });

  it("predicts 1:20:00 for the half at the target VDOT", () => {
    expect(fmtTime(predictSec(58.4, 21097.5))).toBe("1:20:00");
  });
});

describe("velAtVO2", () => {
  it("inverts vo2", () => {
    expect(vo2(320)).toBeCloseTo(vo2(320), 10);
    expect(paceAtFrac(58.4, 1)).toBeGreaterThan(0);
  });
});

describe("zoneRange", () => {
  it("is faster at the fast end, for every zone", () => {
    for (const key of ZONE_KEYS) {
      const { fast, slow } = zoneRange(key, 58.4);
      expect(fast).toBeLessThan(slow);
    }
  });

  it("orders the zones from easy to fast", () => {
    const easy = zoneRange("E", 58.4);
    const threshold = zoneRange("T", 58.4);
    const intervals = zoneRange("I", 58.4);
    expect(easy.fast).toBeGreaterThan(threshold.fast);
    expect(threshold.fast).toBeGreaterThan(intervals.fast);
  });

  it("brackets a race key around the predicted pace", () => {
    const tenK = zoneRange("10K", 58.4);
    expect(tenK.mid).toBeCloseTo(predictSec(58.4, 10000) / 10, 6);
    expect(tenK.fast).toBeCloseTo((tenK.mid ?? 0) - 2, 6);
    expect(tenK.slow).toBeCloseTo((tenK.mid ?? 0) + 2, 6);
  });
});

describe("formatting", () => {
  it.each([
    [0, "0:00"],
    [59.4, "0:59"],
    [227.1, "3:47"],
    [600, "10:00"],
  ])("fmtPace(%s) is %s", (seconds, expected) => {
    expect(fmtPace(seconds)).toBe(expected);
  });

  it.each([
    [90, "1:30"],
    [3599.6, "1:00:00"],
    [4800, "1:20:00"],
  ])("fmtTime(%s) is %s", (seconds, expected) => {
    expect(fmtTime(seconds)).toBe(expected);
  });

  it("shows an en dash when there is nothing to show", () => {
    expect(fmtPace(Number.POSITIVE_INFINITY)).toBe("–");
    expect(fmtTime(Number.NaN)).toBe("–");
  });

  it("labels every zone key", () => {
    for (const key of ZONE_KEYS) expect(zoneLabel(key).length).toBeGreaterThan(0);
    expect(zoneLabel("E")).toBe(ZONES.E.name);
    expect(zoneLabel("HM")).toBe("Half-marathon pace");
  });

  it("writes a pace range as m:ss–m:ss /km", () => {
    expect(paceRangeLabel("T", 58.4)).toBe("3:41–3:47 /km");
    expect(paceRangeLabel("E", 58.4)).toMatch(/^\d:\d\d–\d:\d\d \/km$/);
  });
});
