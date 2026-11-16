import { describe, expect, it } from "vitest";
import {
  MAX_NOTES_LENGTH,
  normaliseNotes,
  notesChanged,
  notesRemaining,
  notesTooLong,
} from "./notes";

describe("normaliseNotes", () => {
  it("trims", () => {
    expect(normaliseNotes("  Calves tight on the second rep.  ")).toBe(
      "Calves tight on the second rep.",
    );
  });

  it("turns anything empty into null, so no notes has one representation", () => {
    // Otherwise clearing a note could store '' one day and null the next, and
    // undo would restore a difference the athlete never made.
    expect(normaliseNotes("")).toBeNull();
    expect(normaliseNotes("   ")).toBeNull();
    expect(normaliseNotes("\n\t ")).toBeNull();
  });

  it("keeps the newlines inside a note", () => {
    expect(normaliseNotes("First line.\nSecond line.")).toBe(
      "First line.\nSecond line.",
    );
  });
});

describe("notesTooLong", () => {
  it("allows a note of exactly the limit", () => {
    expect(notesTooLong("x".repeat(MAX_NOTES_LENGTH))).toBe(false);
  });

  it("refuses one character more", () => {
    expect(notesTooLong("x".repeat(MAX_NOTES_LENGTH + 1))).toBe(true);
  });

  it("counts after trimming, so trailing spaces never push it over", () => {
    expect(notesTooLong("x".repeat(MAX_NOTES_LENGTH) + "    ")).toBe(false);
  });
});

describe("notesRemaining", () => {
  it("counts down from the limit", () => {
    expect(notesRemaining("")).toBe(MAX_NOTES_LENGTH);
    expect(notesRemaining("abc")).toBe(MAX_NOTES_LENGTH - 3);
  });

  it("goes negative once the note is too long, so the count says by how much", () => {
    expect(notesRemaining("x".repeat(MAX_NOTES_LENGTH + 5))).toBe(-5);
  });
});

describe("notesChanged", () => {
  it("compares the normalised text, not the raw text", () => {
    expect(notesChanged("  Felt good.  ", "Felt good.")).toBe(false);
    expect(notesChanged("Felt good.", "Felt flat.")).toBe(true);
  });

  it("sees adding a note and clearing one", () => {
    expect(notesChanged("Felt good.", null)).toBe(true);
    expect(notesChanged("   ", "Felt good.")).toBe(true);
  });

  it("sees no change between empty and null", () => {
    // Saving a blank field over a column that is already null writes nothing,
    // so it must not become the one undoable event.
    expect(notesChanged("", null)).toBe(false);
    expect(notesChanged("   ", null)).toBe(false);
  });
});
