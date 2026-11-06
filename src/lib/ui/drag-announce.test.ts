import { describe, expect, it } from "vitest";
import type { MoveCheck, MoveWarning } from "@/lib/plan";
import {
  DRAG_INSTRUCTIONS,
  announceDragCancel,
  announceDragOver,
  announceDragOverNothing,
  announceDragStart,
  announceDrop,
} from "./drag-announce";

const DATE = "2027-03-20";
const TITLE = "Threshold 3 × 12′";

const ok: MoveCheck = { ok: true, warnings: [] };
const warning: MoveWarning = {
  code: "double_day",
  date: DATE,
  other: { id: "other", title: "Easy shakeout", isKey: false },
  bothKey: false,
};
const warned: MoveCheck = { ok: true, warnings: [warning] };
const rejected: MoveCheck = {
  ok: false,
  reason: { code: "day_full", date: DATE, max: 2 },
};

/** Every sentence is for a live region, so none may be empty or unfinished. */
const sentences = [
  DRAG_INSTRUCTIONS,
  announceDragStart(TITLE, DATE),
  announceDragOver(DATE, ok),
  announceDragOver(DATE, warned),
  announceDragOver(DATE, rejected),
  announceDragOverNothing(),
  announceDragCancel(TITLE),
  announceDrop(TITLE, DATE, ok),
  announceDrop(TITLE, DATE, warned),
  announceDrop(TITLE, DATE, rejected),
];

describe("drag announcements", () => {
  it.each(sentences)("%s is a finished sentence", (sentence) => {
    expect(sentence.trim().length).toBeGreaterThan(0);
    expect(sentence.trim()).toMatch(/[.!?]$/);
  });

  it("names the day in words, never as a bare date", () => {
    expect(announceDragOver(DATE, ok)).toContain("Saturday 20 March 2027");
    expect(announceDragOver(DATE, ok)).not.toContain(DATE);
  });

  it("says a rejected day cannot take the session, and why", () => {
    const said = announceDragOver(DATE, rejected);
    expect(said).toContain("Cannot drop here");
    expect(said).toContain("2 sessions");
  });

  it("says a warned day can take it, with a question first", () => {
    expect(announceDragOver(DATE, warned)).toContain("Drop to move here");
    expect(announceDragOver(DATE, warned)).toContain("Easy shakeout");
  });

  it("repeats every warning, so none is lost to a summary", () => {
    const second: MoveWarning = {
      code: "consecutive_key",
      date: DATE,
      neighbourDate: "2027-03-19",
      neighbour: { id: "n", title: "30′ time trial", isKey: true },
      side: "before",
    };
    const said = announceDragOver(DATE, { ok: true, warnings: [warning, second] });
    expect(said).toContain("Easy shakeout");
    expect(said).toContain("30′ time trial");
  });

  it("names the session in a start, a cancel and a drop", () => {
    expect(announceDragStart(TITLE, DATE)).toContain(TITLE);
    expect(announceDragCancel(TITLE)).toContain(TITLE);
    expect(announceDrop(TITLE, DATE, ok)).toContain(TITLE);
  });

  it("asks for confirmation on a warned drop rather than claiming it is saved", () => {
    expect(announceDrop(TITLE, DATE, warned)).toContain("Confirm");
    expect(announceDrop(TITLE, DATE, ok)).not.toContain("Confirm");
  });

  it("says a rejected drop did not happen", () => {
    expect(announceDrop(TITLE, DATE, rejected)).toContain("was not moved");
  });

  it("tells the athlete about the button as well as the keys", () => {
    expect(DRAG_INSTRUCTIONS).toContain("arrow keys");
    expect(DRAG_INSTRUCTIONS).toContain("Move to");
  });
});
