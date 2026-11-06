import { describe, expect, it } from "vitest";
import { weekStart, type StoredWorkout } from "@/lib/plan";
import { applyMove, applyMoves } from "./move-reducer";
import {
  buildDayView,
  buildMonthView,
  buildWeekView,
  type CalendarDay,
  type CalendarViewModel,
} from "./view-model";

const SAMPLE_VDOT = 47;
/** Plan week 22: a Monday well inside the plan and clear of today. */
const MONDAY = weekStart(22);
const day = (offset: number) => {
  const base = Date.UTC(
    Number(MONDAY.slice(0, 4)),
    Number(MONDAY.slice(5, 7)) - 1,
    Number(MONDAY.slice(8, 10)),
  );
  return new Date(base + offset * 86_400_000).toISOString().slice(0, 10);
};

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
    kind: "easy",
    title: "Easy run",
    is_key: false,
    target_distance_m: 8000,
    week_index: 22,
    pace_zone: "E",
    strides: false,
    status: "planned",
    day_slot: 0,
    ...overrides,
  };
}

const input = (date: string, workouts: StoredWorkout[]) => ({
  date,
  today: MONDAY,
  workouts,
  vdot: SAMPLE_VDOT,
});

/** Every day in a model, whichever view it is. */
function daysOf(model: CalendarViewModel): CalendarDay[] {
  switch (model.view) {
    case "week":
      return model.days;
    case "month":
      return model.weeks.flat();
    case "day":
      return [model.day];
  }
}

const dayAt = (model: CalendarViewModel, date: string) =>
  daysOf(model).find((d) => d.date === date);

const idsOn = (model: CalendarViewModel, date: string) =>
  dayAt(model, date)?.items.map((item) => item.id) ?? [];

describe("applyMove · week view", () => {
  const monday = workout(day(0), { title: "Monday easy", target_distance_m: 9000 });
  const wednesday = workout(day(2), {
    title: "Wednesday threshold",
    kind: "threshold",
    is_key: true,
    target_distance_m: 11000,
  });
  const week = buildWeekView(input(MONDAY, [monday, wednesday]));

  it("takes the session off its old day", () => {
    const next = applyMove(week, { workoutId: monday.id, toDate: day(4) });
    expect(idsOn(next, day(0))).toEqual([]);
  });

  it("puts it on the new day", () => {
    const next = applyMove(week, { workoutId: monday.id, toDate: day(4) });
    expect(idsOn(next, day(4))).toEqual([monday.id]);
  });

  it("moves the day's distance with it", () => {
    const next = applyMove(week, { workoutId: monday.id, toDate: day(4) });
    expect(dayAt(next, day(0))?.metres).toBe(0);
    expect(dayAt(next, day(4))?.metres).toBe(9000);
  });

  it("leaves the week total alone, because the move stays inside the week", () => {
    const next = applyMove(week, { workoutId: monday.id, toDate: day(4) });
    expect(next.view === "week" && next.metres).toBe(week.metres);
  });

  it("recomputes whether a day holds an event", () => {
    const trial = workout(day(0), { kind: "tt", title: "30′ time trial", is_key: true });
    const model = buildWeekView(input(MONDAY, [trial]));
    expect(dayAt(model, day(0))?.isEvent).toBe(true);

    const next = applyMove(model, { workoutId: trial.id, toDate: day(5) });
    expect(dayAt(next, day(0))?.isEvent).toBe(false);
    expect(dayAt(next, day(5))?.isEvent).toBe(true);
  });

  it("gives the moved session the next free slot on a day that holds one", () => {
    const next = applyMove(week, { workoutId: monday.id, toDate: day(2) });
    expect(dayAt(next, day(2))?.items.map((item) => item.daySlot)).toEqual([0, 1]);
  });

  it("orders a double day by slot, not by key session first", () => {
    // The key session is already in slot 0, so the easy run lands second even
    // though the old key-first tie-break would have put it first.
    const next = applyMove(week, { workoutId: monday.id, toDate: day(2) });
    expect(idsOn(next, day(2))).toEqual([wednesday.id, monday.id]);
  });

  it("does not change the model when the id is unknown", () => {
    const next = applyMove(week, { workoutId: "nobody", toDate: day(4) });
    expect(next).toBe(week);
  });

  it("does not change the model when the session is already there", () => {
    const next = applyMove(week, { workoutId: monday.id, toDate: day(0) });
    expect(next).toBe(week);
  });

  it("leaves the week's own labels untouched", () => {
    const next = applyMove(week, { workoutId: monday.id, toDate: day(4) });
    expect(next.view === "week" && next.title).toBe(week.title);
    expect(next.view === "week" && next.plannedKm).toBe(week.plannedKm);
    expect(next.view === "week" && next.rangeLabel).toBe(week.rangeLabel);
  });

  it("drops a session moved outside the window, rather than inventing a day", () => {
    const next = applyMove(week, { workoutId: monday.id, toDate: day(40) });
    expect(daysOf(next).flatMap((d) => d.items)).toHaveLength(1);
    expect(next.view === "week" && next.metres).toBe(11000);
  });
});

describe("applyMove · month view", () => {
  const session = workout(day(0), { target_distance_m: 7000 });
  const month = buildMonthView(input(day(0), [session]));

  it("moves a session across grid rows and keeps six rows of seven", () => {
    const next = applyMove(month, { workoutId: session.id, toDate: day(9) });
    expect(idsOn(next, day(0))).toEqual([]);
    expect(idsOn(next, day(9))).toEqual([session.id]);
    const weeks = next.view === "month" ? next.weeks : [];
    expect(weeks).toHaveLength(6);
    expect(weeks.every((row) => row.length === 7)).toBe(true);
  });

  it("keeps the cells' month flags, which a move cannot change", () => {
    const next = applyMove(month, { workoutId: session.id, toDate: day(9) });
    const before = month.weeks.flat().map((cell) => cell.inMonth);
    const after = next.view === "month" ? next.weeks.flat().map((c) => c.inMonth) : [];
    expect(after).toEqual(before);
  });
});

describe("applyMove · day view", () => {
  const session = workout(day(0));
  const dayModel = buildDayView(input(day(0), [session]));

  it("empties the day when its session leaves", () => {
    const next = applyMove(dayModel, { workoutId: session.id, toDate: day(1) });
    expect(idsOn(next, day(0))).toEqual([]);
    expect(dayAt(next, day(0))?.metres).toBe(0);
  });

  it("ignores a move of a session it does not show", () => {
    const next = applyMove(dayModel, { workoutId: "nobody", toDate: day(1) });
    expect(next).toBe(dayModel);
  });
});

describe("applyMoves", () => {
  const first = workout(day(0), { title: "First" });
  const second = workout(day(1), { title: "Second" });
  const week = buildWeekView(input(MONDAY, [first, second]));

  it("applies every pending move, oldest first", () => {
    const next = applyMoves(week, [
      { workoutId: first.id, toDate: day(3) },
      { workoutId: second.id, toDate: day(3) },
    ]);
    expect(idsOn(next, day(3))).toEqual([first.id, second.id]);
    expect(dayAt(next, day(3))?.items.map((item) => item.daySlot)).toEqual([0, 1]);
  });

  it("follows a session moved twice", () => {
    const next = applyMoves(week, [
      { workoutId: first.id, toDate: day(3) },
      { workoutId: first.id, toDate: day(5) },
    ]);
    expect(idsOn(next, day(3))).toEqual([]);
    expect(idsOn(next, day(5))).toEqual([first.id]);
  });

  it("returns the same model for no moves at all", () => {
    expect(applyMoves(week, [])).toBe(week);
  });
});
