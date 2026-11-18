import { describe, expect, it } from "vitest";
import { niceAxis } from "./axis";

describe("niceAxis", () => {
  it("has nothing to draw for an empty plot", () => {
    // A year with no plan and no runs. An invented 0-to-10 scale with nothing
    // on it would look like data.
    expect(niceAxis(0)).toEqual({ max: 0, ticks: [0] });
  });

  it("treats a negative maximum as empty rather than guessing", () => {
    expect(niceAxis(-5)).toEqual({ max: 0, ticks: [0] });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])("refuses %p", (max) => {
    expect(() => niceAxis(max)).toThrow(RangeError);
  });

  it.each([0, -1, 1.5])("refuses a tick count of %p", (ticks) => {
    expect(() => niceAxis(100, ticks)).toThrow(RangeError);
  });

  it("rounds up to a step a reader can divide", () => {
    // 57 over four intervals is 14.25, which rounds up to a step of 20.
    expect(niceAxis(57)).toEqual({ max: 60, ticks: [0, 20, 40, 60] });
  });

  it("holds the largest bar inside the plot", () => {
    for (const max of [1, 7, 13, 57, 168, 249, 1000, 4321]) {
      const axis = niceAxis(max);
      expect(axis.max, `max ${max}`).toBeGreaterThanOrEqual(max);
    }
  });

  it("keeps every tick a whole number of kilometres", () => {
    // A month with 1 km in it gets 0 · 1, not 0 · 0.2 · 0.4: a fractional
    // axis is more precision than the measurement has.
    for (const max of [0.4, 1, 2, 3.5, 9]) {
      for (const tick of niceAxis(max).ticks) {
        expect(Number.isInteger(tick), `${max} → ${tick}`).toBe(true);
      }
    }
  });

  it("starts at zero and rises by one step throughout", () => {
    for (const max of [3, 57, 168, 720]) {
      const { ticks } = niceAxis(max);
      expect(ticks[0]).toBe(0);
      const step = (ticks[1] ?? 0) - (ticks[0] ?? 0);
      const gaps = ticks.slice(1).map((tick, index) => tick - (ticks[index] ?? 0));
      expect(gaps.every((gap) => gap === step), `max ${max}`).toBe(true);
    }
  });

  it("ends exactly on its maximum", () => {
    for (const max of [1, 57, 168, 4321]) {
      const axis = niceAxis(max);
      expect(axis.ticks.at(-1)).toBe(axis.max);
    }
  });

  it("stays near the tick count it was asked for", () => {
    for (const max of [13, 57, 168, 249, 720]) {
      const { ticks } = niceAxis(max, 4);
      // Four intervals asked for: three to five, plus the zero.
      expect(ticks.length, `max ${max}`).toBeGreaterThanOrEqual(3);
      expect(ticks.length, `max ${max}`).toBeLessThanOrEqual(6);
    }
  });

  it("scales to one huge month without a tick per kilometre", () => {
    expect(niceAxis(380)).toEqual({ max: 400, ticks: [0, 100, 200, 300, 400] });
  });
});
