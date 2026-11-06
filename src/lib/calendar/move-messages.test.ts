import { describe, expect, it } from "vitest";
import {
  MOVE_REJECT_CODES,
  MOVE_WARNING_CODES,
  type MoveWarning,
  type RejectReason,
} from "@/lib/plan";
import {
  STALE_UNDO_MESSAGE,
  dropHint,
  dropState,
  movedMessage,
  planEventMessage,
  rejectHint,
  rejectMessage,
  undoableIndex,
  undoneMessage,
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

describe("dropState and dropHint", () => {
  const ok = { ok: true, warnings: [] } as const;
  const warned = { ok: true, warnings: [warnings.double_day] } as const;

  it("calls a clean day valid and a refused day invalid", () => {
    expect(dropState(ok)).toBe("valid");
    expect(dropState({ ok: false, reason: reasons.day_full })).toBe("invalid");
  });

  it("calls a day that needs confirming a warning, not a rejection", () => {
    // It can still be dropped on; the dialog is what asks.
    expect(dropState(warned)).toBe("warning");
  });

  it("gives each state its own word, so colour is never alone", () => {
    expect(dropHint(ok)).toBe("Drop");
    expect(dropHint(warned)).toBe("Confirm");
    expect(dropHint({ ok: false, reason: reasons.day_full })).toBe("Full");
  });

  it.each(MOVE_REJECT_CODES)("has a cell-sized word for %s", (code) => {
    const hint = dropHint({ ok: false, reason: reasons[code] });
    expect(hint.length).toBeGreaterThan(0);
    // A day cell at 360px fits about eight characters and no more.
    expect(hint.length).toBeLessThanOrEqual(8);
  });
});

describe("the toast sentences", () => {
  it("names the session and the day it went to", () => {
    expect(movedMessage("Easy run", DATE)).toBe(
      "Easy run moved to Thursday 18 March.",
    );
  });

  it("names the day a session came back to", () => {
    expect(undoneMessage("Easy run", NEIGHBOUR)).toBe(
      "Easy run is back on Wednesday 17 March.",
    );
  });

  it("tells the athlete what to do when undo is refused as stale", () => {
    expect(STALE_UNDO_MESSAGE).toContain("most recent change");
    expect(STALE_UNDO_MESSAGE.trim()).toMatch(/\.$/);
  });
});

describe("planEventMessage", () => {
  const move = { from: DATE, to: "2027-03-20" };

  it("names both days of a move", () => {
    expect(
      planEventMessage({ kind: "move_workout", status: "accepted", move }),
    ).toBe("Moved from Thursday 18 March to Saturday 20 March.");
  });

  it("says so when a move has been undone", () => {
    expect(
      planEventMessage({ kind: "move_workout", status: "undone", move }),
    ).toContain("Undone.");
  });

  it("reads an undo as the day the session went back to", () => {
    // The undo event's own payload runs the other way round.
    expect(
      planEventMessage({
        kind: "undo_move",
        status: "accepted",
        move: { from: "2027-03-20", to: DATE },
      }),
    ).toBe("Put back on Thursday 18 March.");
  });

  it("stays a sentence for a kind it cannot read", () => {
    expect(
      planEventMessage({ kind: "coach_proposal", status: "proposed", move: null }),
    ).toBe("A plan change.");
  });
});

describe("undoableIndex", () => {
  const move = (status = "accepted") => ({ kind: "move_workout", status });
  const undo = { kind: "undo_move", status: "accepted" };

  it("is the newest move when nothing has been undone", () => {
    expect(undoableIndex([move(), move()])).toBe(0);
  });

  it("skips the undo row that sits above the move it reversed", () => {
    // What the list looks like straight after an undo: the undo is newest,
    // the move it reversed is marked undone, and the one before is next.
    expect(undoableIndex([undo, move("undone"), move()])).toBe(2);
  });

  it("skips an already undone move", () => {
    expect(undoableIndex([move("undone"), move()])).toBe(1);
  });

  it("never points at an undo, because there is no redo", () => {
    expect(undoableIndex([undo, undo])).toBe(-1);
  });

  it("has nothing to offer for an empty list", () => {
    expect(undoableIndex([])).toBe(-1);
  });

  it("ignores a kind it does not know", () => {
    expect(undoableIndex([{ kind: "coach_proposal", status: "proposed" }])).toBe(-1);
  });
});
