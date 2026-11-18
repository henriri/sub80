import { describe, expect, it } from "vitest";
import { PLAN_START, RACE_DATE } from "@/lib/plan";
import {
  MONTHS_IN_YEAR,
  PLAN_YEARS,
  canStepYear,
  clampYear,
  focusNumbers,
  monthTotals,
  runWindow,
  yearOf,
  yearRange,
  type PlannedMonthRow,
  type RunMonthRow,
} from "./year";

describe("yearOf", () => {
  it.each([
    ["2026-10-19", 2026],
    ["2027-01-01", 2027],
    ["2028-12-31", 2028],
  ])("reads %s as %i", (date, year) => {
    expect(yearOf(date)).toBe(year);
  });

  it.each(["2027-1-1", "not-a-date", ""])("refuses %j", (date) => {
    expect(() => yearOf(date)).toThrow(RangeError);
  });
});

describe("PLAN_YEARS", () => {
  it("comes from the plan's own dates", () => {
    expect(PLAN_YEARS).toEqual({
      first: yearOf(PLAN_START),
      last: yearOf(RACE_DATE),
    });
  });

  it("is the three years the plan runs through", () => {
    // 2026-10-19 to 2028-04-16. Written out once, as a check on the derivation
    // rather than as the source of it.
    expect([PLAN_YEARS.first, PLAN_YEARS.last]).toEqual([2026, 2028]);
  });
});

describe("clampYear", () => {
  it.each([PLAN_YEARS.first, 2027, PLAN_YEARS.last])("keeps %i", (year) => {
    expect(clampYear(year)).toBe(year);
  });

  it("pulls an earlier year up to the first", () => {
    expect(clampYear(2019)).toBe(PLAN_YEARS.first);
  });

  it("pulls a later year down to the last", () => {
    expect(clampYear(2031)).toBe(PLAN_YEARS.last);
  });

  it.each([2026.5, Number.NaN])("refuses %p", (year) => {
    expect(() => clampYear(year)).toThrow(RangeError);
  });
});

describe("canStepYear", () => {
  it("has nowhere to go back from the first year", () => {
    expect(canStepYear(PLAN_YEARS.first, -1)).toBe(false);
    expect(canStepYear(PLAN_YEARS.first, 1)).toBe(true);
  });

  it("has nowhere to go on from the last year", () => {
    expect(canStepYear(PLAN_YEARS.last, 1)).toBe(false);
    expect(canStepYear(PLAN_YEARS.last, -1)).toBe(true);
  });

  it("moves either way in the middle", () => {
    expect(canStepYear(2027, -1)).toBe(true);
    expect(canStepYear(2027, 1)).toBe(true);
  });
});

describe("yearRange", () => {
  it("runs from 1 January to 31 December", () => {
    expect(yearRange(2027)).toEqual({ start: "2027-01-01", end: "2027-12-31" });
  });
});

describe("runWindow", () => {
  it("asks for a day either side of the year, in UTC", () => {
    // Paris is ahead of UTC, so 1 January 00:30 in Paris is 31 December in
    // UTC: a window that stopped at the year's own edges would miss it.
    expect(runWindow(2027)).toEqual({
      from: "2026-12-31T00:00:00Z",
      to: "2028-01-02T00:00:00Z",
    });
  });
});

const planned = (planned_date: string, target_distance_m: number | null) =>
  ({ planned_date, target_distance_m }) satisfies PlannedMonthRow;

const run = (started_at: string, distance_m: number) =>
  ({ started_at, distance_m }) satisfies RunMonthRow;

describe("monthTotals", () => {
  it("gives twelve months whatever the data", () => {
    const totals = monthTotals([], [], 2027);
    expect(totals).toHaveLength(MONTHS_IN_YEAR);
    expect(totals.map((total) => total.month)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(totals.every((total) => total.loggedM === 0)).toBe(true);
    expect(totals.every((total) => total.plannedM === 0)).toBe(true);
  });

  it("sums a month's sessions and a month's runs", () => {
    const totals = monthTotals(
      [planned("2027-03-02", 11000), planned("2027-03-09", 8500)],
      [run("2027-03-02T09:00:00Z", 11200), run("2027-03-09T09:00:00Z", 8000)],
      2027,
    );

    expect(totals[2]).toEqual({ month: 3, loggedM: 19200, plannedM: 19500 });
  });

  it("counts a rest day as nothing, not as a gap", () => {
    expect(monthTotals([planned("2027-05-03", null)], [], 2027)[4]).toEqual({
      month: 5,
      loggedM: 0,
      plannedM: 0,
    });
  });

  it("keeps a skipped session in the planned total", () => {
    // The status is not read at all: a session skipped is still what the plan
    // asked for, and the shortfall is the gap the chart exists to show.
    const totals = monthTotals([planned("2027-06-01", 12000)], [], 2027);
    expect(totals[5]).toEqual({ month: 6, loggedM: 0, plannedM: 12000 });
  });

  it("counts a run that is linked to nothing", () => {
    // There is no link to read here either: a run that happened happened.
    expect(monthTotals([], [run("2027-07-04T06:00:00Z", 15000)], 2027)[6]).toEqual({
      month: 7,
      loggedM: 15000,
      plannedM: 0,
    });
  });

  it("buckets a late-night New Year's Eve run in December", () => {
    // 23:30 on 31 December 2026 in Paris is 22:30 UTC the same day.
    const totals = monthTotals([], [run("2026-12-31T22:30:00Z", 10000)], 2026);
    expect(totals[11]?.loggedM).toBe(10000);
    expect(monthTotals([], [run("2026-12-31T22:30:00Z", 10000)], 2027)[0]?.loggedM).toBe(
      0,
    );
  });

  it("buckets a small-hours New Year's Day run in January", () => {
    // 00:30 on 1 January 2027 in Paris is 23:30 UTC on 31 December 2026. A
    // year sliced in UTC would file this under the previous December.
    const instant = run("2026-12-31T23:30:00Z", 12000);
    expect(monthTotals([], [instant], 2027)[0]).toEqual({
      month: 1,
      loggedM: 12000,
      plannedM: 0,
    });
    expect(monthTotals([], [instant], 2026)[11]?.loggedM).toBe(0);
  });

  it("buckets both sides of a daylight-saving change correctly", () => {
    // Paris moves to UTC+2 at 01:00 UTC on 28 March 2027. 00:30 UTC is 01:30
    // Paris on the 28th; 23:30 UTC on the 27th is 00:30 Paris on the 28th --
    // so both belong to March, and an hour of offset moves neither.
    const totals = monthTotals(
      [],
      [run("2027-03-27T23:30:00Z", 5000), run("2027-03-28T00:30:00Z", 7000)],
      2027,
    );
    expect(totals[2]?.loggedM).toBe(12000);
  });

  it("files an autumn change-day run by its Paris date", () => {
    // Paris leaves UTC+2 at 01:00 UTC on 31 October 2027. 22:30 UTC on 31
    // October is 23:30 Paris, still October; 23:30 UTC is 00:30 on 1 November.
    const totals = monthTotals(
      [],
      [run("2027-10-31T22:30:00Z", 9000), run("2027-10-31T23:30:00Z", 4000)],
      2027,
    );
    expect(totals[9]?.loggedM).toBe(9000);
    expect(totals[10]?.loggedM).toBe(4000);
  });

  it("drops the slack the read deliberately asks for", () => {
    const totals = monthTotals(
      [planned("2026-12-28", 10000), planned("2028-01-03", 10000)],
      [run("2026-12-20T09:00:00Z", 10000), run("2028-01-05T09:00:00Z", 10000)],
      2027,
    );
    expect(totals.every((total) => total.loggedM === 0)).toBe(true);
    expect(totals.every((total) => total.plannedM === 0)).toBe(true);
  });

  it("refuses a run whose instant cannot be read", () => {
    // Loudly: a run dropped here would read as a run that never happened.
    expect(() => monthTotals([], [run("not-an-instant", 10000)], 2027)).toThrow(
      RangeError,
    );
  });
});

describe("focusNumbers", () => {
  it("states the month so far against its plan", () => {
    expect(focusNumbers(96_000, 168_000)).toEqual({
      loggedKm: 96,
      plannedKm: 168,
      toGoKm: 72,
      percent: 57,
      barPercent: 57,
    });
  });

  it("keeps the three numbers in agreement after rounding", () => {
    // 95.6 of 168.4 prints as 96 of 168, so what is left has to print as 72.
    const focus = focusNumbers(95_600, 168_400);
    expect([focus.loggedKm, focus.plannedKm, focus.toGoKm]).toEqual([96, 168, 72]);
    expect(focus.loggedKm + focus.toGoKm).toBe(focus.plannedKm);
  });

  it("has nothing left to go once the plan is met exactly", () => {
    expect(focusNumbers(168_000, 168_000)).toMatchObject({
      toGoKm: 0,
      percent: 100,
      barPercent: 100,
    });
  });

  it("never counts backwards past a plan already beaten", () => {
    expect(focusNumbers(188_000, 168_000)).toMatchObject({
      loggedKm: 188,
      plannedKm: 168,
      toGoKm: 0,
      // The real figure, not a clamped one: a month run over plan says so.
      percent: 112,
      // The bar is clamped, because a bar wider than its track is a bug.
      barPercent: 100,
    });
  });

  it("has no percentage to state with nothing planned", () => {
    expect(focusNumbers(40_000, 0)).toEqual({
      loggedKm: 40,
      plannedKm: 0,
      toGoKm: 0,
      percent: null,
      barPercent: 0,
    });
  });

  it("is a clean zero before anything happens", () => {
    expect(focusNumbers(0, 168_000)).toMatchObject({
      loggedKm: 0,
      toGoKm: 168,
      percent: 0,
      barPercent: 0,
    });
  });
});
