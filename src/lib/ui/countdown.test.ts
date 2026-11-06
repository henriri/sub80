import { describe, expect, it } from "vitest";
import {
  UNDO_WINDOW_SECONDS,
  hold,
  isExpired,
  isHeld,
  release,
  secondsLeft,
  start,
} from "./countdown";

/** An arbitrary epoch, so nothing can depend on a clock. */
const T0 = 1_000_000;
const WINDOW = UNDO_WINDOW_SECONDS * 1000;
const at = (seconds: number) => T0 + seconds * 1000;

describe("start", () => {
  it("begins with the whole window", () => {
    expect(secondsLeft(start(T0), T0)).toBe(UNDO_WINDOW_SECONDS);
  });

  it("is not expired and not held", () => {
    const countdown = start(T0);
    expect(isExpired(countdown, T0)).toBe(false);
    expect(isHeld(countdown)).toBe(false);
  });
});

describe("secondsLeft", () => {
  it("counts down a second at a time", () => {
    const countdown = start(T0);
    expect(secondsLeft(countdown, at(1))).toBe(UNDO_WINDOW_SECONDS - 1);
    expect(secondsLeft(countdown, at(9))).toBe(1);
  });

  it("rounds up, so a part second still reads as a second left", () => {
    expect(secondsLeft(start(T0), T0 + WINDOW - 1)).toBe(1);
  });

  it("reaches 0 exactly at the end of the window", () => {
    expect(secondsLeft(start(T0), T0 + WINDOW)).toBe(0);
  });

  it("never goes below 0", () => {
    expect(secondsLeft(start(T0), at(60))).toBe(0);
  });

  it("ignores a clock that goes backwards", () => {
    expect(secondsLeft(start(T0), T0 - 5000)).toBe(UNDO_WINDOW_SECONDS);
  });
});

describe("isExpired", () => {
  it("is true at the window and false just before it", () => {
    expect(isExpired(start(T0), T0 + WINDOW - 1)).toBe(false);
    expect(isExpired(start(T0), T0 + WINDOW)).toBe(true);
  });

  it("is never true while the countdown is held", () => {
    const held = hold(start(T0), "hover", at(2));
    expect(isExpired(held, at(600))).toBe(false);
  });
});

describe("hold and release", () => {
  it("stops the clock where it was", () => {
    const held = hold(start(T0), "hover", at(3));
    expect(secondsLeft(held, at(3))).toBe(7);
    expect(secondsLeft(held, at(30))).toBe(7);
    expect(isHeld(held)).toBe(true);
  });

  it("resumes from where it stopped, not from the start", () => {
    const held = hold(start(T0), "hover", at(3));
    const resumed = release(held, "hover", at(30));
    expect(secondsLeft(resumed, at(30))).toBe(7);
    expect(secondsLeft(resumed, at(32))).toBe(5);
  });

  it("stays paused while another reason still holds it", () => {
    // The case a boolean would get wrong: hover in, focus in, hover out.
    let countdown = hold(start(T0), "hover", at(1));
    countdown = hold(countdown, "focus", at(2));
    countdown = release(countdown, "hover", at(3));

    expect(isHeld(countdown)).toBe(true);
    expect(secondsLeft(countdown, at(100))).toBe(9);

    countdown = release(countdown, "focus", at(100));
    expect(isHeld(countdown)).toBe(false);
    expect(secondsLeft(countdown, at(104))).toBe(5);
  });

  it("does not bank the elapsed time twice for a repeated hold", () => {
    let countdown = hold(start(T0), "hover", at(2));
    countdown = hold(countdown, "hover", at(8));
    expect(secondsLeft(countdown, at(8))).toBe(8);
    expect(countdown.holds).toEqual(["hover"]);
  });

  it("ignores releasing a hold it does not have", () => {
    const countdown = start(T0);
    expect(release(countdown, "focus", at(5))).toBe(countdown);
  });

  it("keeps an expired countdown expired across a hold", () => {
    const held = hold(start(T0), "hover", at(30));
    expect(isExpired(held, at(30))).toBe(true);
    expect(secondsLeft(held, at(30))).toBe(0);
  });
});
