import { describe, expect, it } from "vitest";
import { RESET_WITHHELD_CODES, resetOffer, type ResetWithheld } from "./deleting";
import { resetCheckboxLabel, resetWithheldMessage } from "./messages";

const TITLE = "Threshold 3 × 12′";

const offer = (overrides: Partial<Parameters<typeof resetOffer>[0]> = {}) =>
  resetOffer({
    workoutTitle: TITLE,
    workoutStatus: "completed",
    otherRuns: 0,
    ...overrides,
  });

describe("resetOffer", () => {
  it("offers the reset for the only run on a completed session", () => {
    expect(offer()).toEqual({ offered: true, workoutTitle: TITLE });
  });

  it("offers nothing for a run with no session", () => {
    expect(offer({ workoutTitle: null, workoutStatus: null })).toEqual({
      offered: false,
      withheld: "no_link",
    });
  });

  /*
   * This has to agree with delete_run, which RAISES on a reset it cannot
   * honour rather than silently skipping it. A checkbox that produces an error
   * is worse than no checkbox.
   */
  it("withholds it while another run is still linked, as the function would refuse", () => {
    expect(offer({ otherRuns: 1 })).toEqual({
      offered: false,
      withheld: "other_runs",
    });
  });

  it("withholds it when there is nothing to put back", () => {
    for (const workoutStatus of ["planned", "skipped"]) {
      expect(offer({ workoutStatus }), workoutStatus).toEqual({
        offered: false,
        withheld: "not_completed",
      });
    }
  });

  it("checks the other runs before the status, so the clearer reason wins", () => {
    // Both apply. "Another run is linked" is the one the athlete can act on.
    expect(offer({ workoutStatus: "planned", otherRuns: 2 }).offered).toBe(false);
    expect(offer({ workoutStatus: "planned", otherRuns: 2 })).toEqual({
      offered: false,
      withheld: "other_runs",
    });
  });

  it("treats a session with no status as no session at all", () => {
    expect(offer({ workoutStatus: null }).offered).toBe(false);
  });
});

describe("resetWithheldMessage", () => {
  // Every code is accounted for: a sentence, or an explicit decision to say
  // nothing. Adding a code without deciding fails here as well as in tsc.
  it.each(RESET_WITHHELD_CODES)("decides what to say about %s", (code) => {
    const message = resetWithheldMessage(code, TITLE);
    if (message !== null) expect(message, code).toMatch(/[.!?]$/);
  });

  it("says nothing when there was never a checkbox to expect", () => {
    expect(resetWithheldMessage("no_link", TITLE)).toBeNull();
    expect(resetWithheldMessage("not_completed", TITLE)).toBeNull();
  });

  it("explains the one case the athlete might have expected", () => {
    expect(resetWithheldMessage("other_runs", TITLE)).toBe(
      `Another run is still linked to ${TITLE}, so it keeps its status.`,
    );
  });

  it("still reads without a title", () => {
    expect(resetWithheldMessage("other_runs", null)).toBe(
      "Another run is still linked to that session, so it keeps its status.",
    );
  });

  it("names every code exactly once", () => {
    const codes: readonly ResetWithheld[] = RESET_WITHHELD_CODES;
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("resetCheckboxLabel", () => {
  it("names what ticking it will do", () => {
    expect(resetCheckboxLabel(TITLE)).toBe(`Put ${TITLE} back to planned`);
  });
});
