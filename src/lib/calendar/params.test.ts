import { describe, expect, it } from "vitest";
import {
  calendarHref,
  defaultParams,
  isValidYmd,
  parseCalendarParams,
  workoutHref,
} from "./params";
import { PLAN_YEARS, clampYear, yearOf } from "./year";

const TODAY = "2027-03-15";

describe("isValidYmd", () => {
  it.each(["2026-10-19", "2028-04-16", "2028-02-29", "2027-12-31"])(
    "accepts %s",
    (date) => {
      expect(isValidYmd(date)).toBe(true);
    },
  );

  it.each([
    // Right shape, no such day.
    "2027-02-30",
    "2027-02-29",
    "2027-04-31",
    "2027-13-01",
    "2027-00-10",
    "2027-01-00",
    // Wrong shape.
    "2027-1-1",
    "20270101",
    "2027-01-01T00:00:00Z",
    "not-a-date",
    "",
  ])("rejects %j", (date) => {
    expect(isValidYmd(date)).toBe(false);
  });
});

describe("parseCalendarParams", () => {
  it("defaults to the week containing today", () => {
    expect(parseCalendarParams({}, TODAY)).toEqual({
      ok: true,
      params: { view: "week", date: TODAY },
    });
  });

  it("takes a view on its own, keeping today", () => {
    expect(parseCalendarParams({ view: "month" }, TODAY)).toEqual({
      ok: true,
      params: { view: "month", date: TODAY },
    });
  });

  it("takes a date on its own, keeping the week view", () => {
    expect(parseCalendarParams({ date: "2026-10-19" }, TODAY)).toEqual({
      ok: true,
      params: { view: "week", date: "2026-10-19" },
    });
  });

  it.each(["week", "month", "day", "year"] as const)("reads view=%s", (view) => {
    const result = parseCalendarParams({ view, date: "2027-10-31" }, TODAY);
    expect(result).toEqual({ ok: true, params: { view, date: "2027-10-31" } });
  });

  it("falls back to today's year for view=year with no date", () => {
    expect(parseCalendarParams({ view: "year" }, TODAY)).toEqual({
      ok: true,
      params: { view: "year", date: TODAY },
    });
    expect(clampYear(yearOf(TODAY))).toBe(yearOf(TODAY));
  });

  it("falls back to the default for view=year with an unreadable date", () => {
    expect(parseCalendarParams({ view: "year", date: "2027-02-30" }, TODAY)).toEqual({
      ok: false,
      fallback: defaultParams(TODAY),
    });
  });

  it("leaves a year outside the plan to the route to clamp", () => {
    // A real date, so this is not the parser's business: the year view's own
    // route reads it, finds it outside the plan and redirects to the nearest
    // year the plan reaches.
    const result = parseCalendarParams({ view: "year", date: "2031-06-01" }, TODAY);
    expect(result).toEqual({
      ok: true,
      params: { view: "year", date: "2031-06-01" },
    });
    expect(clampYear(yearOf("2031-06-01"))).toBe(PLAN_YEARS.last);
  });

  it("ignores parameters it does not own", () => {
    const result = parseCalendarParams({ view: "day", utm_source: "x" }, TODAY);
    expect(result).toEqual({ ok: true, params: { view: "day", date: TODAY } });
  });

  it.each([
    ["an unknown view", { view: "season" }],
    ["an empty view", { view: "" }],
    ["a view in the wrong case", { view: "Week" }],
    ["a repeated view", { view: ["week", "month"] }],
    ["a date that does not exist", { date: "2027-02-30" }],
    ["a date in the wrong shape", { date: "20270101" }],
    ["an empty date", { date: "" }],
    ["a repeated date", { date: ["2027-01-01", "2027-01-02"] }],
    ["one good and one bad", { view: "month", date: "2027-02-30" }],
  ])("falls back to the default for %s", (_label, raw) => {
    expect(parseCalendarParams(raw, TODAY)).toEqual({
      ok: false,
      fallback: defaultParams(TODAY),
    });
  });
});

describe("calendarHref", () => {
  it("carries both parameters, so every link is complete", () => {
    expect(calendarHref({ view: "day", date: "2028-04-16" })).toBe(
      "/?view=day&date=2028-04-16",
    );
    expect(calendarHref(defaultParams(TODAY))).toBe("/?view=week&date=2027-03-15");
  });
});

describe("workoutHref", () => {
  it("carries the calendar the workout was opened from", () => {
    // The view and date are the athlete's, not the workout's: the back link
    // has to return to the month they were browsing.
    expect(
      workoutHref("00000000-0000-4000-8000-000000000001", {
        view: "month",
        date: "2027-03-01",
      }),
    ).toBe(
      "/workouts/00000000-0000-4000-8000-000000000001?view=month&date=2027-03-01",
    );
  });

  it("round-trips through parseCalendarParams", () => {
    // What the detail page actually does with the two parameters.
    const params = { view: "day", date: "2028-04-16" } as const;
    const query = workoutHref("00000000-0000-4000-8000-000000000002", params);
    const raw = Object.fromEntries(
      new URLSearchParams(query.slice(query.indexOf("?") + 1)),
    );

    expect(parseCalendarParams(raw, TODAY)).toEqual({ ok: true, params });
    expect(calendarHref(params)).toBe("/?view=day&date=2028-04-16");
  });
});
