import { describe, expect, it } from "vitest";
import {
  LIGHTEN_FRACTIONS,
  LIGHTEN_REJECT_CODES,
  STATUS_ACTIONS,
  STATUS_REJECT_CODES,
  WORKOUT_STATUSES,
  type LightenReason,
  type StatusReason,
} from "@/lib/plan";
import {
  UNDOABLE_EVENT_KINDS,
  UNDO_KINDS,
  isUndoKind,
  lightenRejectMessage,
  planEventMessage,
  lightenActionLabel,
  statusActionLabel,
  statusRejectMessage,
  statusWord,
  undoableIndex,
  undoneChangeMessage,
  type PlanEventSummary,
} from "./change-messages";

const DATE = "2027-03-18";
const LATER = "2027-03-20";

/** A row of the change log. Only the fields a kind reads need be given. */
const event = (overrides: Partial<PlanEventSummary> & { kind: string }): PlanEventSummary => ({
  status: "accepted",
  move: null,
  before: null,
  after: null,
  ...overrides,
});

describe("planEventMessage", () => {
  it("names both days of a move", () => {
    expect(
      planEventMessage(
        event({ kind: "move_workout", move: { from: DATE, to: LATER } }),
      ),
    ).toBe("Moved from Thursday 18 March to Saturday 20 March.");
  });

  it("says so when a change has been undone, whatever kind it is", () => {
    for (const kind of UNDOABLE_EVENT_KINDS) {
      expect(
        planEventMessage(
          event({
            kind,
            status: "undone",
            move: { from: DATE, to: LATER },
            before: { status: "planned", notes: null, target_distance_m: 14_000 },
            after: { status: "skipped", notes: "A note.", target_distance_m: 11_000 },
          }),
        ),
      ).toContain("Undone.");
    }
  });

  it("tells adding, changing and clearing a note apart", () => {
    const notes = (before: string | null, after: string | null) =>
      planEventMessage(
        event({ kind: "edit_notes", before: { notes: before }, after: { notes: after } }),
      );

    expect(notes(null, "Calves tight.")).toBe("Notes added.");
    expect(notes("Calves tight.", null)).toBe("Notes cleared.");
    expect(notes("Calves tight.", "Felt fine.")).toBe("Notes changed.");
  });

  it("reads a status change as what it was marked", () => {
    const status = (after: "completed" | "skipped" | "planned") =>
      planEventMessage(event({ kind: "set_status", after: { status: after } }));

    expect(status("completed")).toBe("Marked done.");
    expect(status("skipped")).toBe("Marked skipped.");
    // Not "Marked planned": going back is not a marking.
    expect(status("planned")).toBe("Back to planned.");
  });

  it("names both distances of a lighter day", () => {
    expect(
      planEventMessage(
        event({
          kind: "lighten_workout",
          before: { target_distance_m: 14_000 },
          after: { target_distance_m: 11_000 },
        }),
      ),
    ).toBe("Lightened from 14.0 km to 11.0 km.");
  });

  it("names the distance a restore put back", () => {
    expect(
      planEventMessage(
        event({
          kind: "restore_distance",
          before: { target_distance_m: 8_500 },
          after: { target_distance_m: 14_000, original_distance_m: null },
        }),
      ),
    ).toBe("Planned distance restored: 14.0 km.");
  });

  it("says what an undo put back, by the kind it reversed", () => {
    const undo = (undoneKind: string, after: PlanEventSummary["after"]) =>
      planEventMessage(event({ kind: "undo_change", undoneKind, after }));

    expect(undo("move_workout", { planned_date: DATE })).toBe(
      "Put back on Thursday 18 March.",
    );
    expect(undo("edit_notes", { notes: "Calves tight." })).toBe("Notes put back.");
    expect(undo("set_status", { status: "planned" })).toBe(
      "Status put back to planned.",
    );
    expect(undo("lighten_workout", { target_distance_m: 14_000 })).toBe(
      "Distance put back to 14.0 km.",
    );
    expect(undo("restore_distance", { target_distance_m: 8_500 })).toBe(
      "Distance put back to 8.5 km.",
    );
  });

  it("never suffixes an undo row with Undone", () => {
    // An undo is not itself undoable, so the suffix would be a contradiction.
    for (const kind of UNDO_KINDS) {
      expect(
        planEventMessage(
          event({ kind, status: "accepted", undoneKind: "edit_notes" }),
        ),
      ).not.toContain("Undone.");
    }
  });

  it("still reads a historical undo_move, written before undone_kind existed", () => {
    expect(
      planEventMessage(
        event({ kind: "undo_move", move: { from: LATER, to: DATE } }),
      ),
    ).toBe("Put back on Thursday 18 March.");
  });

  it("writes a sentence for every kind of change there is", () => {
    // The exhaustiveness check: a new kind with no branch would fall through
    // to the catch-all, which is a sentence but not an honest one.
    for (const kind of UNDOABLE_EVENT_KINDS) {
      const sentence = planEventMessage(
        event({
          kind,
          move: { from: DATE, to: LATER },
          before: { status: "planned", notes: null, target_distance_m: 14_000 },
          after: { status: "skipped", notes: "A note.", target_distance_m: 11_000 },
        }),
      );
      expect(sentence).not.toBe("A plan change.");
      expect(sentence).toMatch(/\.$/);
    }
  });

  it("stays a sentence for a kind it cannot read", () => {
    expect(planEventMessage(event({ kind: "coach_proposal", status: "proposed" }))).toBe(
      "A plan change.",
    );
  });

  it("stays a sentence when a payload is missing what its kind reads", () => {
    // An older event, or one whose payload did not survive validation. Every
    // branch has to cope with a null snapshot rather than printing undefined.
    for (const kind of [...UNDOABLE_EVENT_KINDS, ...UNDO_KINDS]) {
      const sentence = planEventMessage(event({ kind }));
      expect(sentence.length).toBeGreaterThan(0);
      expect(sentence).not.toContain("undefined");
      expect(sentence).toMatch(/\.$/);
    }
  });
});

describe("undoneChangeMessage", () => {
  it("is the sentence the undo event will itself carry", () => {
    // Built from one table, so the toast cannot promise something the history
    // then words differently.
    const restored = { notes: "Calves tight." };
    expect(undoneChangeMessage("edit_notes", restored)).toBe(
      planEventMessage(
        event({ kind: "undo_change", undoneKind: "edit_notes", after: restored }),
      ),
    );
  });

  it("covers every kind of change", () => {
    for (const kind of UNDOABLE_EVENT_KINDS) {
      expect(
        undoneChangeMessage(kind, {
          planned_date: DATE,
          status: "planned",
          notes: null,
          target_distance_m: 14_000,
        }),
      ).toMatch(/\.$/);
    }
  });
});

describe("isUndoKind", () => {
  it("knows both undo kinds and nothing else", () => {
    for (const kind of UNDO_KINDS) expect(isUndoKind(kind)).toBe(true);
    for (const kind of UNDOABLE_EVENT_KINDS) expect(isUndoKind(kind)).toBe(false);
    expect(isUndoKind("coach_proposal")).toBe(false);
  });
});

describe("undoableIndex", () => {
  const change = (status = "accepted") => ({ kind: "edit_notes", status });
  const move = (status = "accepted") => ({ kind: "move_workout", status });
  const undo = { kind: "undo_change", status: "accepted" };

  it("is the newest change when nothing has been undone", () => {
    expect(undoableIndex([change(), move()])).toBe(0);
  });

  it("skips the undo row that sits above the change it reversed", () => {
    // What the list looks like straight after an undo: the undo is newest,
    // the change it reversed is marked undone, and the one below is next.
    expect(undoableIndex([undo, change("undone"), move()])).toBe(2);
  });

  it("skips an already undone change", () => {
    expect(undoableIndex([change("undone"), move()])).toBe(1);
  });

  it("does not care which kind the undoable row is", () => {
    for (const kind of UNDOABLE_EVENT_KINDS) {
      expect(undoableIndex([{ kind, status: "accepted" }])).toBe(0);
    }
  });

  it("never points at an undo, because there is no redo", () => {
    expect(undoableIndex([undo, { kind: "undo_move", status: "accepted" }])).toBe(-1);
  });

  it("has nothing to offer for an empty list", () => {
    expect(undoableIndex([])).toBe(-1);
  });

  it("offers nothing a coach only proposed", () => {
    // The database accepts an undo for an accepted event alone, so the
    // interface must not offer one for a proposal.
    expect(undoableIndex([{ kind: "coach_proposal", status: "proposed" }])).toBe(-1);
    expect(undoableIndex([{ kind: "set_status", status: "rejected" }])).toBe(-1);
  });
});

describe("statusWord", () => {
  it("says done rather than completed, which is only the column's word", () => {
    expect(statusWord("completed")).toBe("done");
    expect(statusWord("skipped")).toBe("skipped");
    expect(statusWord("planned")).toBe("planned");
  });

  it("has a word for every status", () => {
    for (const status of WORKOUT_STATUSES) {
      expect(statusWord(status).length).toBeGreaterThan(0);
    }
  });
});

describe("lightenRejectMessage", () => {
  /** One reason per code, so every branch has a case. */
  const reasons: Record<(typeof LIGHTEN_REJECT_CODES)[number], LightenReason> = {
    not_planned: { code: "not_planned", status: "completed" },
    in_past: { code: "in_past", date: DATE, today: LATER },
    no_distance: { code: "no_distance" },
    already_minimum: { code: "already_minimum", metres: 1_000 },
    would_raise: { code: "would_raise", fromM: 8_500, toM: 11_000 },
    no_original: { code: "no_original" },
    week_cap_exceeded: {
      code: "week_cap_exceeded",
      weekIndex: 22,
      metres: 62_000,
      capKm: 60,
    },
  };

  it("has a sentence for every code", () => {
    for (const code of LIGHTEN_REJECT_CODES) {
      const sentence = lightenRejectMessage(reasons[code]);
      expect(sentence.length).toBeGreaterThan(0);
      expect(sentence.trim()).toMatch(/\.$/);
    }
  });

  it("tells the athlete to restore first rather than that a button failed", () => {
    expect(lightenRejectMessage(reasons.would_raise)).toContain("Restore");
    expect(lightenRejectMessage(reasons.would_raise)).toContain("8.5 km");
  });

  it("says which session is history, done or skipped", () => {
    expect(
      lightenRejectMessage({ code: "not_planned", status: "completed" }),
    ).toContain("already done");
    expect(
      lightenRejectMessage({ code: "not_planned", status: "skipped" }),
    ).toContain("skipped");
  });

  it("gives the ceiling the same sentence a move would", () => {
    expect(lightenRejectMessage(reasons.week_cap_exceeded)).toContain("60 km ceiling");
  });
});

describe("statusRejectMessage", () => {
  const reasons: Record<(typeof STATUS_REJECT_CODES)[number], StatusReason> = {
    already: { code: "already", status: "completed" },
  };

  it("has a sentence for every code", () => {
    for (const code of STATUS_REJECT_CODES) {
      expect(statusRejectMessage(reasons[code]).trim()).toMatch(/\.$/);
    }
  });

  it("names the status the session already has", () => {
    expect(statusRejectMessage({ code: "already", status: "completed" })).toContain(
      "already marked done",
    );
    expect(statusRejectMessage({ code: "already", status: "planned" })).toContain(
      "already planned",
    );
  });
});

describe("the button labels", () => {
  it("asks for a status change as a verb, not as a status", () => {
    expect(statusActionLabel("skipped")).toBe("Mark skipped");
    expect(statusActionLabel("planned")).toBe("Back to planned");
  });

  it("labels every action", () => {
    for (const action of STATUS_ACTIONS) {
      expect(statusActionLabel(action).length).toBeGreaterThan(0);
    }
  });

  it("says the percentage and the distance it would give", () => {
    // The number on the button is the number that will be stored, so the
    // athlete is never told 20% and given a rounding they did not expect.
    expect(lightenActionLabel(0.2, 11_000)).toBe("20% lighter · 11.0 km");
    expect(lightenActionLabel(0.4, 8_500)).toBe("40% lighter · 8.5 km");
  });

  it("labels both fractions", () => {
    for (const by of LIGHTEN_FRACTIONS) {
      expect(lightenActionLabel(by, 10_000)).toMatch(/^\d+% lighter/);
    }
  });
});
