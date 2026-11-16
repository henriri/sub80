import { describe, expect, it } from "vitest";
import {
  PLAN_START,
  RACE_DATE,
  addDays,
  dayOfWeek,
  weekIndexOf,
  weekStart,
} from "@/lib/plan";
import {
  EDGE_PADDING_DAYS,
  MONTH_GRID_DAYS,
  addMonths,
  daysInMonth,
  monthEnd,
  monthRange,
  monthStart,
  fetchRange,
  step,
  visibleEnd,
  visibleRange,
  weekRange,
} from "./range";

describe("weekRange", () => {
  it("runs Monday to Sunday whatever day it is given", () => {
    for (const date of ["2027-03-15", "2027-03-18", "2027-03-21"]) {
      const { start, end, days } = weekRange(date);
      expect(start, date).toBe("2027-03-15");
      expect(end, date).toBe("2027-03-21");
      expect(days, date).toHaveLength(7);
      expect(dayOfWeek(start)).toBe(0);
      expect(dayOfWeek(end)).toBe(6);
    }
  });

  it("starts on the plan's first Monday for the first plan week", () => {
    expect(weekRange(PLAN_START).start).toBe(PLAN_START);
    expect(weekRange(PLAN_START).end).toBe("2026-10-25");
  });

  it("ends on race day for the last plan week", () => {
    expect(weekRange(RACE_DATE).start).toBe(weekStart(78));
    expect(weekRange(RACE_DATE).start).toBe("2028-04-10");
    expect(weekRange(RACE_DATE).end).toBe(RACE_DATE);
  });
});

describe("daylight saving cannot lose or duplicate a day", () => {
  // Europe/Paris springs forward on 2027-03-28 and falls back on 2027-10-31,
  // both Sundays, so both land on the last day of a Monday-first week.
  it.each([
    ["spring forward", "2027-03-24", "2027-03-22", "2027-03-28"],
    ["fall back", "2027-10-27", "2027-10-25", "2027-10-31"],
  ])("%s: the week holds seven distinct days", (_label, inside, start, end) => {
    const week = weekRange(inside);
    expect(week.start).toBe(start);
    expect(week.end).toBe(end);
    expect(new Set(week.days).size).toBe(7);
    expect(week.days.at(-1)).toBe(end);
  });

  it.each(["2027-03-15", "2027-10-15"])(
    "the %s month grid holds 42 distinct days",
    (date) => {
      expect(new Set(monthRange(date).days).size).toBe(MONTH_GRID_DAYS);
    },
  );
});

describe("month bounds", () => {
  it("counts the days in a month, leap years included", () => {
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2027, 4)).toBe(30);
    expect(daysInMonth(2027, 12)).toBe(31);
  });

  it("finds the first and last day", () => {
    expect(monthStart("2027-03-15")).toBe("2027-03-01");
    expect(monthEnd("2027-03-15")).toBe("2027-03-31");
    expect(monthEnd("2027-02-10")).toBe("2027-02-28");
    expect(monthEnd("2028-02-10")).toBe("2028-02-29");
  });

  it("clamps a month step to the shorter month", () => {
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2027-12-15", 1)).toBe("2028-01-15");
    expect(addMonths("2027-01-15", -1)).toBe("2026-12-15");
  });
});

describe("monthRange", () => {
  it("has no leading days when the month starts on a Monday", () => {
    // 2027-02-01 is a Monday, and February 2027 fits in four rows, so the
    // fixed six-row grid shows two whole trailing weeks.
    expect(dayOfWeek("2027-02-01")).toBe(0);
    const range = monthRange("2027-02-15");
    expect(range.start).toBe("2027-02-01");
    expect(range.end).toBe("2027-02-28");
    expect(range.gridStart).toBe("2027-02-01");
    expect(range.gridEnd).toBe("2027-03-14");
    expect(range.days).toHaveLength(MONTH_GRID_DAYS);
  });

  it("has six leading days when the month starts on a Sunday", () => {
    // 2027-08-01 is a Sunday: the grid opens on the Monday six days before.
    expect(dayOfWeek("2027-08-01")).toBe(6);
    const range = monthRange("2027-08-20");
    expect(range.start).toBe("2027-08-01");
    expect(range.end).toBe("2027-08-31");
    expect(range.gridStart).toBe("2027-07-26");
    expect(range.gridEnd).toBe("2027-09-05");
  });

  it("always opens on a Monday and closes on a Sunday", () => {
    for (let month = 1; month <= 12; month++) {
      const date = `2027-${String(month).padStart(2, "0")}-10`;
      const { gridStart, gridEnd, start, end } = monthRange(date);
      expect(dayOfWeek(gridStart), date).toBe(0);
      expect(dayOfWeek(gridEnd), date).toBe(6);
      // Six rows are always enough to cover the whole month.
      expect(gridStart <= start, date).toBe(true);
      expect(gridEnd >= end, date).toBe(true);
    }
  });
});

describe("visibleRange", () => {
  it("asks for exactly what each view shows", () => {
    expect(visibleRange("week", "2027-03-18")).toEqual({
      from: "2027-03-15",
      days: 7,
    });
    expect(visibleRange("month", "2027-08-20")).toEqual({
      from: "2027-07-26",
      days: 42,
    });
    expect(visibleRange("day", "2027-03-18")).toEqual({
      from: "2027-03-18",
      days: 1,
    });
  });
});

describe("step", () => {
  it("moves a week at a time in the week view", () => {
    expect(step("week", "2027-03-15", 1)).toBe("2027-03-22");
    expect(step("week", "2027-03-15", -1)).toBe("2027-03-08");
  });

  it("moves a day at a time in the day view, across a DST change", () => {
    expect(step("day", "2027-03-27", 1)).toBe("2027-03-28");
    expect(step("day", "2027-10-31", -1)).toBe("2027-10-30");
  });

  it("lands on the first of the month, so paging cannot drift", () => {
    expect(step("month", "2027-01-31", 1)).toBe("2027-02-01");
    expect(step("month", "2027-02-01", 1)).toBe("2027-03-01");
    expect(step("month", "2027-01-15", -1)).toBe("2026-12-01");

    // Twelve steps forward and twelve back return to the same month.
    let date = "2027-01-31";
    for (let i = 0; i < 12; i++) date = step("month", date, 1);
    for (let i = 0; i < 12; i++) date = step("month", date, -1);
    expect(date).toBe("2027-01-01");
  });
});

describe("bad input", () => {
  it.each(["", "2027-1-1", "20270101", "not-a-date"])("rejects %j", (date) => {
    expect(() => monthStart(date)).toThrow(RangeError);
  });
});

describe("visibleEnd", () => {
  it("is the last day each view renders", () => {
    expect(visibleEnd("week", "2027-03-18")).toBe("2027-03-21");
    expect(visibleEnd("day", "2027-03-18")).toBe("2027-03-18");
    // 1 March 2027 is itself a Monday, so the grid is 1 March plus 41 days.
    expect(visibleEnd("month", "2027-03-18")).toBe("2027-04-11");
  });

  it("agrees with visibleRange for every view", () => {
    for (const view of ["week", "month", "day"] as const) {
      const { from, days } = visibleRange(view, "2027-03-18");
      expect(visibleEnd(view, "2027-03-18")).toBe(addDays(from, days - 1));
    }
  });
});

describe("fetchRange", () => {
  const DATE = "2027-03-18";

  it("adds a day either side of the week", () => {
    expect(visibleRange("week", DATE)).toEqual({ from: "2027-03-15", days: 7 });
    expect(fetchRange("week", DATE)).toEqual({ from: "2027-03-14", days: 9 });
  });

  it("adds a day either side of the month grid", () => {
    const visible = visibleRange("month", DATE);
    const fetched = fetchRange("month", DATE);

    expect(fetched.from).toBe(addDays(visible.from, -EDGE_PADDING_DAYS));
    expect(fetched.days).toBe(visible.days + EDGE_PADDING_DAYS * 2);
  });

  it("leaves the day view alone", () => {
    // One rendered day is also the only drop target, so a drag within it can
    // only be refused as same_date. There is no neighbour to warn about.
    expect(fetchRange("day", DATE)).toEqual(visibleRange("day", DATE));
  });

  it("covers the visible range and exactly two days more", () => {
    for (const view of ["week", "month"] as const) {
      const visible = visibleRange(view, DATE);
      const fetched = fetchRange(view, DATE);

      expect(fetched.from < visible.from).toBe(true);
      expect(addDays(fetched.from, fetched.days - 1) > visibleEnd(view, DATE)).toBe(
        true,
      );
      expect(fetched.days - visible.days).toBe(2);
    }
  });

  it("pads only into weeks the view does not render", () => {
    // This is what keeps the padding out of every 60 km and five-runs check:
    // validateMove sums by week_index, and a drop target is always a rendered
    // day, so a padding day in another week can never be in a destination
    // week. A week view pads with the previous Sunday and the next Monday; a
    // month grid is six whole Monday-to-Sunday weeks, so the same holds.
    for (const view of ["week", "month"] as const) {
      const visible = visibleRange(view, DATE);
      const renderedWeeks = new Set(
        Array.from({ length: visible.days }, (_, offset) =>
          weekIndexOf(addDays(visible.from, offset)),
        ),
      );
      const fetched = fetchRange(view, DATE);
      const padding = [
        fetched.from,
        addDays(fetched.from, fetched.days - 1),
      ];

      for (const date of padding) {
        expect(renderedWeeks.has(weekIndexOf(date)), `${view} ${date}`).toBe(false);
      }
    }
  });
});
