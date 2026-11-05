import { describe, expect, it } from "vitest";
import {
  MOVE_REJECT_CODES,
  MOVE_WARNING_CODES,
  type MoveWarning,
  type RejectReason,
} from "@/lib/plan";
import {
  rejectHint,
  rejectMessage,
  warningMessage,
  warningTitle,
} from "./move-messages";

const DATE = "2027-03-18";
const NEIGHBOUR = "2027-03-17";

/** One reason per code, so every branch has a case. */
const reasons: Record<RejectReason["code"], RejectReason> = {
  not_planned: { code: "not_planned", status: "completed" },
  same_date: { code: "same_date", date: DATE },
  source_in_past: { code: "source_in_past", date: DATE, today: "2027-03-20" },
  destination_in_past: {
    code: "destination_in_past",
    date: DATE,
    today: "2027-03-20",
  },
  outside_plan: { code: "outside_plan", date: "2028-05-01" },
  day_full: { code: "day_full", date: DATE, max: 2 },
  week_runs_exceeded: { code: "week_runs_exceeded", weekIndex: 22, runs: 6, max: 5 },
  week_cap_exceeded: {
    code: "week_cap_exceeded",
    weekIndex: 22,
    metres: 61_000,
    capKm: 60,
  },
};

/**
 * Typed per variant rather than as `MoveWarning`, so a spread below keeps the
 * discriminant and `{ ...doubleDay, bothKey: true }` still typechecks.
 */
const doubleDay = {
  code: "double_day",
  date: DATE,
  other: { id: "a", title: "Easy shakeout", isKey: false },
  bothKey: false,
} satisfies Extract<MoveWarning, { code: "double_day" }>;

const consecutiveKey = {
  code: "consecutive_key",
  date: DATE,
  neighbourDate: NEIGHBOUR,
  neighbour: { id: "b", title: "Long run", isKey: true },
  side: "before",
} satisfies Extract<MoveWarning, { code: "consecutive_key" }>;

const warnings: Record<MoveWarning["code"], MoveWarning> = {
  double_day: doubleDay,
  consecutive_key: consecutiveKey,
};

describe("rejectMessage", () => {
  // Adding a reject code without copy fails here, not only in tsc.
  it.each(MOVE_REJECT_CODES)("has a sentence for %s", (code) => {
    const message = rejectMessage(reasons[code]);
    expect(message.length, code).toBeGreaterThan(0);
    expect(message, code).toMatch(/[.!?]$/);
  });

  it("names the day rather than the date, and drops the year", () => {
    expect(rejectMessage(reasons.day_full)).toBe(
      "Thursday 18 March already has 2 sessions.",
    );
  });

  it("tells a completed session from a skipped one", () => {
    expect(rejectMessage({ code: "not_planned", status: "completed" })).toContain(
      "already done",
    );
    expect(rejectMessage({ code: "not_planned", status: "skipped" })).toContain(
      "skipped",
    );
  });

  it("gives the week, the total and the ceiling", () => {
    expect(rejectMessage(reasons.week_cap_exceeded)).toBe(
      "Week 22 would reach 61.0 km, over the 60 km ceiling.",
    );
  });
});

describe("rejectHint", () => {
  // The hint sits in a day cell, so it has to stay short.
  it.each(MOVE_REJECT_CODES)("has a short hint for %s", (code) => {
    const hint = rejectHint(reasons[code]);
    expect(hint.length, code).toBeGreaterThan(0);
    expect(hint.length, code).toBeLessThanOrEqual(8);
  });

  it("says the same thing for a past source and a past destination", () => {
    expect(rejectHint(reasons.source_in_past)).toBe("Past");
    expect(rejectHint(reasons.destination_in_past)).toBe("Past");
  });
});

describe("warningMessage", () => {
  it.each(MOVE_WARNING_CODES)("has a sentence for %s", (code) => {
    const message = warningMessage(warnings[code]);
    expect(message.length, code).toBeGreaterThan(0);
    expect(message, code).toMatch(/[.!?]$/);
  });

  it("names the other session on a double day", () => {
    expect(warningMessage(warnings.double_day)).toBe(
      "Thursday 18 March would be a double day, alongside Easy shakeout.",
    );
  });

  it("says explicitly when both sessions on the day are key ones", () => {
    const message = warningMessage({
      ...doubleDay,
      bothKey: true,
      other: { id: "a", title: "30′ time trial", isKey: true },
    });

    expect(message).toContain("two key sessions");
    expect(message).toContain("30′ time trial");
  });

  it("says which side the neighbouring key session is on", () => {
    expect(warningMessage(warnings.consecutive_key)).toContain("the day before");
    expect(
      warningMessage({ ...consecutiveKey, side: "after" }),
    ).toContain("the day after");
  });
});

describe("warningTitle", () => {
  it("asks about the one warning when there is only one", () => {
    expect(warningTitle([warnings.double_day])).toBe("Make this a double day?");
    expect(warningTitle([warnings.consecutive_key])).toBe(
      "Put two key sessions back to back?",
    );
  });

  it("asks the general question when several apply at once", () => {
    expect(warningTitle([warnings.double_day, warnings.consecutive_key])).toBe(
      "Move this session anyway?",
    );
  });

  it("stays sensible with no warnings at all", () => {
    expect(warningTitle([])).toBe("Move this session?");
  });
});
