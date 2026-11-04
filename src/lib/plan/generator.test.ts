import { describe, expect, it } from "vitest";
import { MAX_WEEK, RACE_DATE, addDays, dayOfWeek } from "./dates";
import { allWeeks, buildWeek, phaseOf, phases, plan } from "./generator";
import { PLAN_SESSION_COUNT } from "./rows";
import golden from "./__fixtures__/plan-golden.json";

const weeks = allWeeks();

/**
 * The weekly ceiling is 60 km (CLAUDE.md). 62 leaves room for the race week,
 * where the 21.1 km race distance is not a multiple of a half kilometre.
 */
const KM_LIMIT = 62;

describe("the port matches the legacy plan", () => {
  it("generates 78 weeks", () => {
    expect(weeks).toHaveLength(MAX_WEEK);
  });

  it("deep-equals the golden fixture, week by week", () => {
    for (let i = 1; i <= MAX_WEEK; i++) {
      expect(plan(i), `week ${i}`).toEqual(golden[i - 1]);
    }
  });

  it("deep-equals the golden fixture as a whole", () => {
    expect(weeks).toEqual(golden);
  });

  it("is deterministic: two calls produce equal, separate weeks", () => {
    const a = buildWeek(36);
    const b = buildWeek(36);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.sessions[0]).not.toBe(b.sessions[0]);
  });
});

describe("plan invariants", () => {
  it("never puts two sessions on the same day", () => {
    for (const week of weeks) {
      const days = week.sessions.map((s) => s.dow);
      expect(new Set(days).size, `week ${week.i}`).toBe(days.length);
      for (const day of days) {
        expect(day).toBeGreaterThanOrEqual(0);
        expect(day).toBeLessThanOrEqual(6);
      }
    }
  });

  it("runs 3 to 5 times a week", () => {
    for (const week of weeks) {
      expect(week.sessions.length, `week ${week.i}`).toBeLessThanOrEqual(5);
      expect(week.sessions.length, `week ${week.i}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps weekly volume at the sum of its sessions, under the cap", () => {
    for (const week of weeks) {
      const sum = week.sessions.reduce((a, s) => a + s.km, 0);
      expect(week.km, `week ${week.i}`).toBe(Math.round(sum));
      expect(week.km, `week ${week.i}`).toBeLessThanOrEqual(KM_LIMIT);
    }
  });

  it("gives every session a distance above zero", () => {
    for (const week of weeks) {
      for (const session of week.sessions) {
        expect(session.km, session.id).toBeGreaterThan(0);
      }
    }
  });

  it("ends on the race date", () => {
    const last = weeks[MAX_WEEK - 1];
    const race = last?.sessions.at(-1);
    expect(race?.dow).toBe(6);
    expect(addDays(last?.start ?? "", 6)).toBe(RACE_DATE);
    expect(race?.kind).toBe("race");
    expect(race?.key).toBe("HM");
    expect(race?.title).toContain("sub-1:20");
  });

  it("has 357 sessions in total", () => {
    const total = weeks.reduce((a, w) => a + w.sessions.length, 0);
    expect(total).toBe(PLAN_SESSION_COUNT);
  });

  it("gives every session a pace zone", () => {
    for (const week of weeks) {
      for (const session of week.sessions) expect(session.key, session.id).not.toBeNull();
    }
  });

  it("covers every week with exactly one phase", () => {
    for (let i = 1; i <= MAX_WEEK; i++) {
      const matching = phases.filter((p) => i >= p.from && i <= p.to);
      expect(matching, `week ${i}`).toHaveLength(1);
      expect(phaseOf(i).id).toBe(matching[0]?.id);
    }
    expect(phases[0]?.from).toBe(1);
    expect(phases.at(-1)?.to).toBe(MAX_WEEK);
  });

  it("puts a long run or a race on Sunday in every week", () => {
    for (const week of weeks) {
      const sunday = week.sessions.find((s) => s.dow === 6);
      expect(sunday, `week ${week.i}`).toBeDefined();
      expect(["long", "race"], `week ${week.i}`).toContain(sunday?.kind);
    }
  });

  it("starts every week on a Monday", () => {
    for (const week of weeks) expect(dayOfWeek(week.start), `week ${week.i}`).toBe(0);
  });

  it("marks one down week in every four", () => {
    for (const week of weeks) {
      expect(week.down, `week ${week.i}`).toBe((week.i - phaseOf(week.i).from) % 4 === 3);
    }
  });
});

describe("the special weeks survive the port", () => {
  it("has the 30′ time trial in week 8", () => {
    const tt = buildWeek(8).sessions.find((s) => s.kind === "tt");
    expect(tt?.dow).toBe(3);
    expect(tt?.km).toBe(9);
    expect(tt?.title).toContain("30′ time trial");
  });

  it("has the 5k time trial in week 36", () => {
    const week = buildWeek(36);
    const tt = week.sessions.find((s) => s.dow === 1);
    expect(tt?.kind).toBe("tt");
    expect(tt?.km).toBe(10);
    expect(week.label).toBe("Down week");
  });

  it("races a 5k in week 52 and a 10k in week 58", () => {
    for (const [i, key, km] of [
      [52, "5K", 9],
      [58, "10K", 14],
    ] as const) {
      const week = buildWeek(i);
      expect(week.label).toBe("Race week");
      const race = week.sessions.find((s) => s.kind === "race");
      expect(race?.key).toBe(key);
      expect(race?.km).toBe(km);
      expect(race?.dow).toBe(6);
    }
  });

  it("offers a tune-up race in week 66", () => {
    const week = buildWeek(66);
    expect(week.label).toBe("Down week + tune-up");
    const race = week.sessions.find((s) => s.dow === 6);
    expect(race?.kind).toBe("race");
    expect(race?.key).toBe("10K");
    expect(race?.km).toBe(14);
  });

  it("tapers to 48 km in week 77", () => {
    const week = buildWeek(77);
    expect(week.label).toBe("Taper week");
    expect(week.km).toBe(48);
  });

  it("refuses a week outside the plan", () => {
    for (const i of [0, -1, 79, 1.5, Number.NaN]) {
      expect(() => buildWeek(i)).toThrow(RangeError);
    }
  });
});
