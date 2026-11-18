import { describe, expect, it } from "vitest";
import { buildYearView, type YearViewInput } from "./year-view";
import type { PlannedMonthRow, RunMonthRow } from "./year";

/** Mid-November 2027, so the current month is one with a month either side. */
const TODAY = "2027-11-18";

const planned = (date: string, metres: number | null): PlannedMonthRow => ({
  planned_date: date,
  target_distance_m: metres,
});

const run = (startedAt: string, metres: number): RunMonthRow => ({
  started_at: startedAt,
  distance_m: metres,
});

const build = (overrides: Partial<YearViewInput> = {}) =>
  buildYearView({
    date: TODAY,
    today: TODAY,
    planned: [],
    runs: [],
    ...overrides,
  });

describe("buildYearView", () => {
  it("is titled with the year it reads from the date", () => {
    const model = build({ date: "2026-12-31" });
    expect(model.view).toBe("year");
    expect(model.year).toBe(2026);
    expect(model.title).toBe("2026");
  });

  it("keeps the date the URL carried, for the view switcher to hand on", () => {
    expect(build({ date: "2027-06-15" }).date).toBe("2027-06-15");
  });

  it("has a column for every month whatever the data", () => {
    const model = build();
    expect(model.months).toHaveLength(12);
    expect(model.months.map((month) => month.initial).join("")).toBe("JFMAMJJASOND");
    expect(model.months.map((month) => month.name)[0]).toBe("January");
  });

  it("totals the whole year in whole kilometres", () => {
    const model = build({
      planned: [planned("2027-03-02", 11_000), planned("2027-04-02", 9_400)],
      runs: [run("2027-03-02T09:00:00Z", 11_200), run("2027-04-02T09:00:00Z", 9_000)],
    });

    expect(model.loggedKm).toBe(20);
    expect(model.plannedKm).toBe(20);
  });

  it("scales the axis to the tallest bar in either series", () => {
    const model = build({
      planned: [planned("2027-03-02", 57_000)],
      runs: [run("2027-04-02T09:00:00Z", 12_000)],
    });

    // 57 km planned is the tallest thing on the plot, and the axis has to
    // hold it: a bar taller than its own scale is a drawing that lies.
    expect(model.axis.max).toBeGreaterThanOrEqual(57);
    expect(model.axis.ticks[0]).toBe(0);
  });

  it("draws both series against that one axis", () => {
    const model = build({
      planned: [planned("2027-03-02", 100_000)],
      runs: [run("2027-03-02T09:00:00Z", 50_000)],
    });
    const march = model.months[2];

    expect(march?.plannedPercent).toBe(100);
    // Half the planned distance is half the height, on the same scale.
    expect(march?.loggedPercent).toBe(50);
  });

  it("gives a month with neither a plan nor a run no bar at all", () => {
    const model = build({ planned: [planned("2027-03-02", 11_000)] });

    expect(model.months[2]?.hasData).toBe(true);
    expect(model.months[6]?.hasData).toBe(false);
    expect(model.months[6]?.loggedPercent).toBe(0);
    expect(model.months[6]?.plannedPercent).toBe(0);
  });

  it("leaves an empty year with no scale rather than an invented one", () => {
    const model = build();

    expect(model.axis).toEqual({ max: 0, ticks: [0] });
    expect(model.months.every((month) => !month.hasData)).toBe(true);
    expect(model.loggedKm).toBe(0);
    expect(model.plannedKm).toBe(0);
  });

  it("opens each month in the month view", () => {
    const hrefs = build().months.map((month) => month.href);

    expect(hrefs[0]).toBe("/?view=month&date=2027-01-01");
    expect(hrefs[11]).toBe("/?view=month&date=2027-12-01");
    expect(new Set(hrefs).size).toBe(12);
  });

  it("names a column by its month and both its numbers", () => {
    const model = build({
      planned: [planned("2027-03-02", 11_000)],
      runs: [run("2027-03-02T09:00:00Z", 12_000)],
    });

    expect(model.months[2]?.label).toBe("March, 12 km logged of 11 km planned");
    expect(model.months[6]?.label).toBe("July, nothing planned or logged");
  });

  it("marks the current month, and says so in words too", () => {
    const model = build();
    const november = model.months[10];

    expect(november?.isCurrent).toBe(true);
    expect(november?.label).toContain("this month");
    expect(model.months.filter((month) => month.isCurrent)).toHaveLength(1);
  });

  it("marks no month at all in another year", () => {
    const model = build({ date: "2026-05-05" });

    expect(model.months.every((month) => !month.isCurrent)).toBe(true);
    expect(model.focus).toBeNull();
  });

  it("puts the month in progress in focus", () => {
    const model = build({
      planned: [planned("2027-11-02", 168_000)],
      runs: [run("2027-11-03T09:00:00Z", 96_000)],
    });

    expect(model.focus).toEqual({
      monthName: "November",
      loggedKm: 96,
      plannedKm: 168,
      toGoKm: 72,
      percent: 57,
      barPercent: 57,
    });
  });

  it("keeps the focus on today's month even in a year being browsed", () => {
    // The year under the cursor is this one, so the focus is this month; the
    // previous year's November is not "in progress" in any sense.
    expect(build({ date: "2027-01-05" }).focus?.monthName).toBe("November");
    expect(build({ date: "2026-11-05" }).focus).toBeNull();
  });

  it("has a focus with no percentage when nothing is planned this month", () => {
    const model = build({ runs: [run("2027-11-03T09:00:00Z", 40_000)] });

    expect(model.focus).toMatchObject({ percent: null, barPercent: 0, toGoKm: 0 });
  });

  it("files a run by its Paris month, not its UTC one", () => {
    // 00:30 on 1 November in Paris is 23:30 on 31 October in UTC.
    const model = build({ runs: [run("2027-10-31T23:30:00Z", 8_000)] });

    expect(model.months[9]?.loggedKm).toBe(0);
    expect(model.months[10]?.loggedKm).toBe(8);
  });

  it("ignores the slack the year read deliberately asks for", () => {
    const model = build({
      runs: [run("2026-12-20T09:00:00Z", 10_000), run("2028-01-05T09:00:00Z", 10_000)],
      planned: [planned("2026-12-28", 10_000), planned("2028-01-03", 10_000)],
    });

    expect(model.loggedKm).toBe(0);
    expect(model.plannedKm).toBe(0);
  });
});
