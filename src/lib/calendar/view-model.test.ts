import { describe, expect, it } from "vitest";
import {
  MAX_WEEK,
  PLAN_START,
  RACE_DATE,
  buildWeek,
  type StoredWorkout,
  type WorkoutKind,
  type ZoneKey,
} from "@/lib/plan";
import {
  OUTSIDE_PLAN,
  buildCalendarView,
  buildDayView,
  buildMonthView,
  buildWeekView,
  isPlanWeek,
  plannedKmFor,
  sumMetres,
  weekTitle,
} from "./view-model";

const SAMPLE_VDOT = 47;
/** Intl separates a date range with thin spaces round an en dash. */
const RANGE_DASH = " – ";
/** 'm:ss–m:ss /km'. */
const PACE_LABEL = /^\d+:\d{2}–\d+:\d{2} \/km$/;

let nextId = 1;

function workout(
  planned_date: string,
  overrides: Partial<StoredWorkout> = {},
): StoredWorkout {
  const id = String(nextId++).padStart(12, "0");
  return {
    id: `00000000-0000-4000-8000-${id}`,
    generated_key: null,
    planned_date,
    kind: "easy" as WorkoutKind,
    title: "Easy run",
    is_key: false,
    target_distance_m: 8000,
    week_index: 1,
    pace_zone: "E" as ZoneKey,
    strides: false,
    ...overrides,
  };
}

const input = (date: string, today: string, workouts: StoredWorkout[] = []) => ({
  date,
  today,
  workouts,
  vdot: SAMPLE_VDOT,
});

describe("isPlanWeek", () => {
  it.each([
    [-1, false],
    [0, false],
    [1, true],
    [13, true],
    [MAX_WEEK, true],
    [MAX_WEEK + 1, false],
    [1.5, false],
  ])("week %i is in the plan: %s", (week, expected) => {
    expect(isPlanWeek(week)).toBe(expected);
  });
});

describe("weekTitle", () => {
  it("reads week, phase and label", () => {
    expect(weekTitle(13)).toBe("Week 13 · Aerobic base · Build week");
    expect(weekTitle(1)).toBe("Week 1 · Re-entry · Build week");
    expect(weekTitle(16)).toBe("Week 16 · Aerobic base · Down week");
    expect(weekTitle(77)).toBe("Week 77 · Half-specific · Taper week");
    expect(weekTitle(78)).toBe("Week 78 · Half-specific · Race week");
  });

  it("is null outside the plan, rather than throwing", () => {
    expect(weekTitle(0)).toBeNull();
    expect(weekTitle(MAX_WEEK + 1)).toBeNull();
    expect(plannedKmFor(0)).toBeNull();
    expect(plannedKmFor(1)).toBe(buildWeek(1).km);
  });
});

describe("sumMetres", () => {
  it("adds distances and skips the ones that are not set", () => {
    expect(sumMetres([])).toBe(0);
    expect(sumMetres([{ metres: 8000 }, { metres: null }, { metres: 12500 }])).toBe(
      20500,
    );
  });
});

describe("buildWeekView", () => {
  it("describes the plan's first week", () => {
    const view = buildWeekView(
      input(PLAN_START, PLAN_START, [
        workout(PLAN_START, { target_distance_m: 6000 }),
        workout("2026-10-25", {
          kind: "long",
          title: "Long run",
          is_key: true,
          target_distance_m: 10000,
        }),
      ]),
    );

    expect(view.view).toBe("week");
    expect(view.start).toBe(PLAN_START);
    expect(view.end).toBe("2026-10-25");
    expect(view.weekIndex).toBe(1);
    expect(view.title).toBe("Week 1 · Re-entry · Build week");
    expect(view.rangeLabel).toBe(`19${RANGE_DASH}25 Oct 2026`);
    expect(view.days).toHaveLength(7);
    expect(view.metres).toBe(16000);
    expect(view.plannedKm).toBe(buildWeek(1).km);
  });

  it("describes the plan's last week, ending on race day", () => {
    const view = buildWeekView(input(RACE_DATE, PLAN_START, []));

    expect(view.start).toBe("2028-04-10");
    expect(view.end).toBe(RACE_DATE);
    expect(view.weekIndex).toBe(MAX_WEEK);
    expect(view.title).toBe("Week 78 · Half-specific · Race week");
    expect(view.days.every((day) => day.inPlan)).toBe(true);
  });

  it("stays calm before the plan starts", () => {
    const view = buildWeekView(input("2026-10-07", "2026-10-07"));

    expect(view.weekIndex).toBeNull();
    expect(view.title).toBe(OUTSIDE_PLAN);
    expect(view.plannedKm).toBeNull();
    expect(view.metres).toBe(0);
    expect(view.days.every((day) => !day.inPlan)).toBe(true);
    expect(view.days.every((day) => day.items.length === 0)).toBe(true);
  });

  it("stays calm after race day", () => {
    const view = buildWeekView(input("2028-04-20", "2026-10-07"));

    expect(view.weekIndex).toBeNull();
    expect(view.title).toBe(OUTSIDE_PLAN);
    expect(view.plannedKm).toBeNull();
  });

  it("marks today, labels every day and ignores rows outside the range", () => {
    const view = buildWeekView(
      input("2027-03-18", "2027-03-18", [
        workout("2027-03-18"),
        // A row from the following week: the query is inclusive, the model is not.
        workout("2027-03-23"),
      ]),
    );

    expect(view.days.map((day) => day.isToday)).toEqual([
      false,
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
    expect(view.days.map((day) => day.dow)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(view.days.map((day) => day.weekdayLabel)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
    expect(view.days[0]?.fullLabel).toBe("Monday 15 March 2027");
    expect(view.metres).toBe(8000);
  });

  it("puts key sessions first on a day that holds more than one", () => {
    const view = buildWeekView(
      input("2027-03-15", "2027-03-15", [
        workout("2027-03-15", { title: "Afternoon shakeout" }),
        workout("2027-03-15", { title: "Threshold", kind: "threshold", is_key: true }),
        workout("2027-03-15", { title: "Aerobic double" }),
      ]),
    );

    expect(view.days[0]?.items.map((item) => item.title)).toEqual([
      "Threshold",
      "Aerobic double",
      "Afternoon shakeout",
    ]);
  });

  it("marks a race or a time trial as an event", () => {
    const view = buildWeekView(
      input("2028-04-16", "2027-03-15", [
        workout(RACE_DATE, { kind: "race", title: "RACE: half marathon", is_key: true }),
        workout("2028-04-13", { kind: "tt", title: "Time trial", is_key: true }),
        workout("2028-04-11"),
      ]),
    );

    const events = view.days.filter((day) => day.isEvent).map((day) => day.date);
    expect(events).toEqual(["2028-04-13", RACE_DATE]);
  });

  it("derives a pace label from the VDOT, and none without a zone", () => {
    const view = buildWeekView(
      input("2027-03-15", "2027-03-15", [
        workout("2027-03-15", { pace_zone: "T" }),
        workout("2027-03-16", { pace_zone: null, kind: "rest", title: "Rest" }),
      ]),
    );

    expect(view.days[0]?.items[0]?.paceLabel).toMatch(PACE_LABEL);
    expect(view.days[1]?.items[0]?.paceLabel).toBeNull();
  });
});

describe("buildMonthView", () => {
  it("is six rows of seven, titled by the month", () => {
    const view = buildMonthView(
      input("2027-03-18", "2027-03-18", [workout("2027-03-18")]),
    );

    expect(view.view).toBe("month");
    expect(view.title).toBe("March 2027");
    expect(view.start).toBe("2027-03-01");
    expect(view.weeks).toHaveLength(6);
    expect(view.weeks.every((row) => row.length === 7)).toBe(true);
  });

  it("carries the day number and the greyed-out flag onto each cell", () => {
    const view = buildMonthView(input("2027-08-20", "2027-03-18"));
    const cells = view.weeks.flat();

    expect(cells[0]?.date).toBe("2027-07-26");
    expect(cells[0]?.inMonth).toBe(false);
    expect(cells[6]?.date).toBe("2027-08-01");
    expect(cells[6]?.inMonth).toBe(true);
    expect(cells[6]?.dayOfMonth).toBe(1);
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(31);
  });

  it("marks the days before the plan starts as outside it", () => {
    const view = buildMonthView(input("2026-10-15", "2026-10-15"));
    const cells = view.weeks.flat();

    expect(cells.filter((cell) => cell.inPlan).every((cell) => cell.date >= PLAN_START)).toBe(
      true,
    );
    expect(cells.find((cell) => cell.date === "2026-10-18")?.inPlan).toBe(false);
    expect(cells.find((cell) => cell.date === PLAN_START)?.inPlan).toBe(true);
  });
});

describe("buildDayView", () => {
  it("titles the day in full and names its plan week", () => {
    const view = buildDayView(
      input("2027-03-18", "2027-03-18", [
        workout("2027-03-18", { kind: "threshold", pace_zone: "T", strides: true }),
      ]),
    );

    expect(view.view).toBe("day");
    expect(view.title).toBe("Thursday 18 March 2027");
    expect(view.weekIndex).toBe(22);
    expect(view.subtitle).toBe(weekTitle(22));
    expect(view.day.isToday).toBe(true);
    expect(view.day.items).toHaveLength(1);
    expect(view.day.items[0]?.strides).toBe(true);
    expect(view.day.metres).toBe(8000);
  });

  it("has no subtitle outside the plan", () => {
    const view = buildDayView(input("2026-01-01", "2027-03-18"));

    expect(view.weekIndex).toBeNull();
    expect(view.subtitle).toBeNull();
    expect(view.day.inPlan).toBe(false);
    expect(view.day.items).toEqual([]);
  });
});

describe("buildCalendarView", () => {
  it.each(["week", "month", "day"] as const)("dispatches on view=%s", (view) => {
    expect(buildCalendarView(view, input("2027-03-18", "2027-03-18")).view).toBe(view);
  });
});
