import { describe, expect, it } from "vitest";
import { PLAN_START, RACE_DATE } from "@/lib/plan";
import {
  formatDateRange,
  formatFullDate,
  formatKm,
  formatKmValue,
  formatMonthTitle,
  formatWeekdayShort,
} from "./format";

describe("formatMonthTitle", () => {
  it.each([
    ["2027-03-01", "March 2027"],
    ["2027-03-31", "March 2027"],
    ["2026-10-19", "October 2026"],
    ["2028-04-16", "April 2028"],
  ])("%s is in %s", (date, expected) => {
    expect(formatMonthTitle(date)).toBe(expected);
  });
});

describe("formatWeekdayShort", () => {
  it("labels a Monday-first week", () => {
    const week = [
      "2027-03-15",
      "2027-03-16",
      "2027-03-17",
      "2027-03-18",
      "2027-03-19",
      "2027-03-20",
      "2027-03-21",
    ];
    expect(week.map(formatWeekdayShort)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
  });
});

describe("formatFullDate", () => {
  it("reads as a whole date, for a cell's accessible name", () => {
    expect(formatFullDate(PLAN_START)).toBe("Monday 19 October 2026");
    expect(formatFullDate(RACE_DATE)).toBe("Sunday 16 April 2028");
  });
});

describe("daylight saving cannot shift a label", () => {
  // Europe/Paris springs forward on 2027-03-28 and falls back on 2027-10-31.
  it.each([
    ["2027-03-27", "Saturday 27 March 2027", "Sat"],
    ["2027-03-28", "Sunday 28 March 2027", "Sun"],
    ["2027-03-29", "Monday 29 March 2027", "Mon"],
    ["2027-10-30", "Saturday 30 October 2027", "Sat"],
    ["2027-10-31", "Sunday 31 October 2027", "Sun"],
    ["2027-11-01", "Monday 1 November 2027", "Mon"],
  ])("%s is %s", (date, full, weekday) => {
    expect(formatFullDate(date)).toBe(full);
    expect(formatWeekdayShort(date)).toBe(weekday);
  });

  it("keeps the month title on the right side of a transition", () => {
    expect(formatMonthTitle("2027-03-28")).toBe("March 2027");
    expect(formatMonthTitle("2027-10-31")).toBe("October 2027");
  });
});

describe("formatDateRange", () => {
  it("drops the repeated month and year", () => {
    expect(formatDateRange("2026-10-19", "2026-10-25")).toContain("19");
    expect(formatDateRange("2026-10-19", "2026-10-25")).toContain("25 Oct 2026");
  });

  it("spells both sides out across a month or a year", () => {
    expect(formatDateRange("2027-03-29", "2027-04-04")).toContain("29 Mar");
    expect(formatDateRange("2027-03-29", "2027-04-04")).toContain("4 Apr 2027");
    expect(formatDateRange("2027-12-27", "2028-01-02")).toContain("27 Dec 2027");
    expect(formatDateRange("2027-12-27", "2028-01-02")).toContain("2 Jan 2028");
  });
});

describe("distances", () => {
  it("shows one decimal, with and without the unit", () => {
    expect(formatKmValue(8000)).toBe("8.0");
    expect(formatKmValue(12500)).toBe("12.5");
    expect(formatKmValue(0)).toBe("0.0");
    expect(formatKm(21097)).toBe("21.1 km");
  });
});

describe("bad input", () => {
  it.each(["", "2027-1-1", "20270101", "not-a-date"])("rejects %j", (date) => {
    expect(() => formatFullDate(date)).toThrow(RangeError);
    expect(() => formatMonthTitle(date)).toThrow(RangeError);
  });
});
