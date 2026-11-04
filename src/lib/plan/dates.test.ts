import { describe, expect, it } from "vitest";
import {
  PLAN_START,
  RACE_DATE,
  addDays,
  dayOfWeek,
  diffDays,
  formatDayLabel,
  parisDate,
  weekIndexOf,
  weekStart,
} from "./dates";

describe("week arithmetic", () => {
  it("starts on the first Monday and ends on race day", () => {
    expect(weekStart(1)).toBe(PLAN_START);
    expect(dayOfWeek(PLAN_START)).toBe(0);
    expect(weekStart(78)).toBe("2028-04-10");
    expect(addDays(weekStart(78), 6)).toBe(RACE_DATE);
    expect(dayOfWeek(RACE_DATE)).toBe(6);
  });

  it("round-trips a week index", () => {
    for (const week of [1, 8, 36, 52, 66, 78]) {
      expect(weekIndexOf(weekStart(week))).toBe(week);
      expect(weekIndexOf(addDays(weekStart(week), 6))).toBe(week);
    }
  });

  it("counts whole days between dates", () => {
    expect(diffDays(PLAN_START, RACE_DATE)).toBe(545);
    expect(diffDays(RACE_DATE, PLAN_START)).toBe(-545);
  });
});

describe("daylight saving cannot shift a day", () => {
  // Europe/Paris springs forward on 2027-03-28 and falls back on 2027-10-31.
  it.each([
    ["2027-03-27", 1, "2027-03-28"],
    ["2027-03-28", -1, "2027-03-27"],
    ["2027-10-30", 1, "2027-10-31"],
    ["2027-10-31", -1, "2027-10-30"],
    ["2027-03-21", 7, "2027-03-28"],
    ["2027-10-24", 7, "2027-10-31"],
  ])("addDays(%s, %i) is %s", (from, days, expected) => {
    expect(addDays(from, days)).toBe(expected);
  });

  it("keeps the weekday across both transitions", () => {
    expect(dayOfWeek("2027-03-28")).toBe(6);
    expect(dayOfWeek("2027-10-31")).toBe(6);
  });
});

describe("parisDate", () => {
  it("uses the Paris calendar day, not UTC", () => {
    // 22:30 UTC is already the next day in Paris (summer time, UTC+2).
    expect(parisDate(new Date("2027-07-14T22:30:00Z"))).toBe("2027-07-15");
    // 23:30 UTC in winter (UTC+1) is also the next day.
    expect(parisDate(new Date("2027-01-14T23:30:00Z"))).toBe("2027-01-15");
    // Midday is unambiguous.
    expect(parisDate(new Date("2027-01-14T12:00:00Z"))).toBe("2027-01-14");
  });
});

describe("formatDayLabel", () => {
  it("reads as a short weekday and date", () => {
    expect(formatDayLabel(RACE_DATE)).toBe("Sun 16 Apr");
    expect(formatDayLabel(PLAN_START)).toBe("Mon 19 Oct");
  });
});

describe("bad input", () => {
  it.each(["", "2027-1-1", "20270101", "not-a-date"])("rejects %j", (date) => {
    expect(() => addDays(date, 1)).toThrow(RangeError);
  });
});
