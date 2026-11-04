import { describe, expect, it } from "vitest";
import { MAX_WEEK, RACE_DATE, dayOfWeek, weekStart } from "./dates";
import { allWeeks } from "./generator";
import { PLAN_SESSION_COUNT, isKeyKind, toPlannedRows } from "./rows";
import { insertRowsSchema } from "./rows-schema";

// A valid v4 UUID: the insert schema checks the shape Supabase Auth hands us.
const USER_ID = "11111111-1111-4111-8111-111111111111";
const weeks = allWeeks();
const rows = toPlannedRows(weeks, USER_ID);

describe("toPlannedRows", () => {
  it("maps every session to a row", () => {
    expect(rows).toHaveLength(PLAN_SESSION_COUNT);
    expect(rows.every((row) => row.user_id === USER_ID)).toBe(true);
  });

  it("passes the insert schema", () => {
    expect(insertRowsSchema.safeParse(rows).success).toBe(true);
  });

  it("dates each row on the weekday its session asks for", () => {
    let checked = 0;
    for (const week of weeks) {
      const inWeek = rows.filter((row) => row.week_index === week.i);
      expect(inWeek, `week ${week.i}`).toHaveLength(week.sessions.length);
      for (const [index, session] of week.sessions.entries()) {
        const row = inWeek[index];
        expect(row?.title, session.id).toBe(session.title);
        expect(dayOfWeek(row?.planned_date ?? ""), session.id).toBe(session.dow);
        checked++;
      }
    }
    expect(checked).toBe(PLAN_SESSION_COUNT);
  });

  it("keeps every row inside its own plan week", () => {
    for (const row of rows) {
      expect(row.planned_date >= weekStart(row.week_index), row.planned_date).toBe(true);
      expect(row.planned_date < weekStart(row.week_index + 1), row.planned_date).toBe(true);
    }
  });

  it("puts the half marathon on 2028-04-16", () => {
    const race = rows.filter((row) => row.kind === "race" && row.week_index === MAX_WEEK);
    expect(race).toHaveLength(1);
    expect(race[0]).toMatchObject({
      planned_date: RACE_DATE,
      kind: "race",
      is_key: true,
      pace_zone: "HM",
      target_distance_m: 25100,
      week_index: 78,
      strides: false,
    });
  });

  it("converts km to whole metres", () => {
    for (const row of rows) {
      expect(Number.isInteger(row.target_distance_m), row.title).toBe(true);
      expect(row.target_distance_m).toBeGreaterThan(0);
    }
  });

  it("totals the same distance per week as the plan", () => {
    for (const week of weeks) {
      const metres = rows
        .filter((row) => row.week_index === week.i)
        .reduce((a, row) => a + row.target_distance_m, 0);
      const sum = week.sessions.reduce((a, s) => a + s.km, 0);
      expect(metres, `week ${week.i}`).toBe(Math.round(sum * 1000));
      // week.km is that sum rounded, so the two agree within the rounding.
      expect(Math.abs(metres / 1000 - week.km), `week ${week.i}`).toBeLessThanOrEqual(0.5);
    }
  });

  it("marks quality sessions as key, and easy running as not", () => {
    for (const row of rows) expect(row.is_key, row.title).toBe(isKeyKind(row.kind));
    for (const kind of ["easy", "hills", "steady", "rest"] as const) {
      expect(isKeyKind(kind), kind).toBe(false);
    }
    for (const kind of ["sweet", "threshold", "interval", "tt", "race", "long"] as const) {
      expect(isKeyKind(kind), kind).toBe(true);
    }
    expect(rows.filter((row) => row.is_key).length).toBeGreaterThan(0);
  });

  it("gives every row a unique generated_key, so one insert cannot self-conflict", () => {
    const keys = new Set(rows.map((row) => row.generated_key));
    expect(keys.size).toBe(rows.length);
  });

  it("carries the generator's session id as generated_key", () => {
    for (const week of weeks) {
      for (const session of week.sessions) {
        expect(rows.some((row) => row.generated_key === session.id), session.id).toBe(true);
      }
    }
    expect(rows[0]?.generated_key).toBe("w1-d1");
    expect(rows.at(-1)?.generated_key).toBe("w78-d6");
  });

  it("repeats titles across the plan, so a title is not an identity", () => {
    const titles = new Set(rows.map((row) => row.title));
    expect(titles.size).toBeLessThan(rows.length);
    // The generated rows do happen to be unique by date and title as well.
    // generated_key is not there for them: it is there so a row added later,
    // or a workout moved onto a day that already has one, cannot collide.
    const pairs = new Set(rows.map((row) => `${row.planned_date}|${row.title}`));
    expect(pairs.size).toBe(rows.length);
  });

  it("gives every row a pace zone and a plan week", () => {
    for (const row of rows) {
      expect(row.pace_zone, row.title).not.toBeNull();
      expect(row.week_index).toBeGreaterThanOrEqual(1);
      expect(row.week_index).toBeLessThanOrEqual(MAX_WEEK);
    }
  });

  it("returns nothing for no weeks", () => {
    expect(toPlannedRows([], USER_ID)).toEqual([]);
  });
});
