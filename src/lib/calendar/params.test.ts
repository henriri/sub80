import { describe, expect, it } from "vitest";
import { calendarHref, defaultParams, isValidYmd, parseCalendarParams } from "./params";

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

  it.each(["week", "month", "day"] as const)("reads view=%s", (view) => {
    const result = parseCalendarParams({ view, date: "2027-10-31" }, TODAY);
    expect(result).toEqual({ ok: true, params: { view, date: "2027-10-31" } });
  });

  it("ignores parameters it does not own", () => {
    const result = parseCalendarParams({ view: "day", utm_source: "x" }, TODAY);
    expect(result).toEqual({ ok: true, params: { view: "day", date: TODAY } });
  });

  it.each([
    ["an unknown view", { view: "year" }],
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
