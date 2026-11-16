import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/plan";
import {
  LINK_WINDOW_DAYS,
  PICKER_WINDOW_DAYS,
  isLinkFar,
  linkableOn,
  logRunHref,
} from "./linking";
import type { LinkableWorkout } from "./schemas";

/** Plan week 22, far from either daylight-saving change. */
const DATE = "2027-03-18";

let nextId = 1;

function workout(overrides: Partial<LinkableWorkout> = {}): LinkableWorkout {
  const id = String(nextId++).padStart(12, "0");
  return {
    id: `00000000-0000-4000-8000-${id}`,
    title: "Easy run",
    planned_date: DATE,
    pace_zone: "E",
    status: "planned",
    target_distance_m: 10_000,
    run_count: 0,
    ...overrides,
  };
}

const on = (offset: number) => workout({ planned_date: addDays(DATE, offset) });

describe("linkableOn", () => {
  it("offers the sessions within three days either side", () => {
    const given = [on(-4), on(-3), on(0), on(3), on(4)];
    const offered = linkableOn(given, DATE);

    expect(offered.map((w) => w.planned_date)).toEqual([
      addDays(DATE, 0),
      addDays(DATE, -3),
      addDays(DATE, 3),
    ]);
  });

  it("puts the run's own day first, because that is nearly always the one meant", () => {
    const offered = linkableOn([on(2), on(0), on(-1)], DATE);

    expect(offered[0]?.planned_date).toBe(DATE);
  });

  it("orders two equally distant days chronologically", () => {
    const offered = linkableOn([on(2), on(-2)], DATE);

    expect(offered.map((w) => w.planned_date)).toEqual([
      addDays(DATE, -2),
      addDays(DATE, 2),
    ]);
  });

  it("follows the date it is given, not the one the page was built with", () => {
    const given = [on(0), on(7)];
    const moved = addDays(DATE, 7);

    expect(linkableOn(given, DATE).map((w) => w.planned_date)).toEqual([DATE]);
    expect(linkableOn(given, moved).map((w) => w.planned_date)).toEqual([moved]);
  });

  it("offers nothing rather than guessing when the week is empty", () => {
    expect(linkableOn([], DATE)).toEqual([]);
  });

  it("does not mutate what it was given", () => {
    const given = [on(2), on(0)];
    const before = given.map((w) => w.planned_date);

    linkableOn(given, DATE);

    expect(given.map((w) => w.planned_date)).toEqual(before);
  });

  it("takes a wider window when asked, which is what the page reads with", () => {
    const given = [on(0), on(8)];

    expect(linkableOn(given, DATE, PICKER_WINDOW_DAYS)).toHaveLength(2);
    expect(linkableOn(given, DATE)).toHaveLength(1);
  });

  it("reads wider than it offers, so the date can move without a round trip", () => {
    expect(PICKER_WINDOW_DAYS).toBeGreaterThan(LINK_WINDOW_DAYS);
  });
});

describe("isLinkFar", () => {
  /*
   * Moving the date can take a run away from the session it was pointed at.
   * The link is not dropped -- the athlete chose it, and three days either way
   * is still plausibly that session -- so the form says so instead.
   */
  it("is quiet while the chosen session is still near the date", () => {
    const chosen = on(2);
    expect(isLinkFar([chosen], DATE, chosen.id)).toBe(false);
  });

  it("says so once the date has moved away from the chosen session", () => {
    const chosen = on(0);
    expect(isLinkFar([chosen], addDays(DATE, 5), chosen.id)).toBe(true);
  });

  it("is quiet at exactly the edge of the window", () => {
    const chosen = on(0);
    expect(isLinkFar([chosen], addDays(DATE, LINK_WINDOW_DAYS), chosen.id)).toBe(false);
    expect(isLinkFar([chosen], addDays(DATE, LINK_WINDOW_DAYS + 1), chosen.id)).toBe(true);
  });

  it("has nothing to say when no session was chosen", () => {
    expect(isLinkFar([on(0)], DATE, null)).toBe(false);
  });

  it("has nothing to say about a session it cannot see", () => {
    // Out of the read window entirely: the form cannot measure the distance,
    // so it must not claim the link is wrong.
    expect(isLinkFar([on(0)], DATE, "00000000-0000-4000-8000-0000000000ff")).toBe(false);
  });
});

describe("logRunHref", () => {
  it("carries the session, its day and its planned distance", () => {
    expect(
      logRunHref({
        id: "00000000-0000-4000-8000-000000000001",
        planned_date: "2027-03-18",
        target_distance_m: 11_000,
      }),
    ).toBe(
      "/runs/new?workout=00000000-0000-4000-8000-000000000001&date=2027-03-18&distance=11",
    );
  });

  it("writes a fractional distance in kilometres", () => {
    const href = logRunHref({
      id: "00000000-0000-4000-8000-000000000001",
      planned_date: "2027-03-18",
      target_distance_m: 8500,
    });

    expect(href).toContain("distance=8.5");
  });

  it("leaves the distance out when the session has none", () => {
    const href = logRunHref({
      id: "00000000-0000-4000-8000-000000000001",
      planned_date: "2027-03-18",
      target_distance_m: null,
    });

    expect(href).not.toContain("distance");
    expect(href).toContain("date=2027-03-18");
  });

  it("escapes what it puts in the query rather than concatenating it", () => {
    // The id comes from the database, but the encoding must not depend on that.
    const href = logRunHref({
      id: "a b",
      planned_date: "2027-03-18",
      target_distance_m: null,
    });

    expect(href).toContain("workout=a+b");
  });
});
