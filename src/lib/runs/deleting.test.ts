import { describe, expect, it } from "vitest";
import { resetsLinkedSession } from "./deleting";

describe("resetsLinkedSession", () => {
  it("puts the session back when this was its only run", () => {
    // A session is completed if and only if a run is linked to it, so deleting
    // the last one has to put it back. Not a choice: the alternative is a
    // session marked done with nothing behind it.
    expect(resetsLinkedSession({ linked: true, otherRuns: 0 })).toBe(true);
  });

  it("leaves the session done when another run still points at it", () => {
    // Still done, by the same rule. delete_run raises on a reset it cannot
    // honour, so this must agree with it rather than ask for one.
    expect(resetsLinkedSession({ linked: true, otherRuns: 1 })).toBe(false);
    expect(resetsLinkedSession({ linked: true, otherRuns: 4 })).toBe(false);
  });

  it("resets nothing for a run that stands alone", () => {
    expect(resetsLinkedSession({ linked: false, otherRuns: 0 })).toBe(false);
  });

  it("never asks for a reset delete_run would refuse", () => {
    // The two refusals in delete_run, exactly: no link, and another run on the
    // session. Anything this returns true for is a reset the function honours.
    const refused = [
      { linked: false, otherRuns: 0 },
      { linked: false, otherRuns: 2 },
      { linked: true, otherRuns: 1 },
    ];

    for (const input of refused) {
      expect(resetsLinkedSession(input), JSON.stringify(input)).toBe(false);
    }
  });
});
