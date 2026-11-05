/**
 * The undo window: how long the toast keeps offering Undo, and the arithmetic
 * of pausing it.
 *
 * Pure, with `now` always an argument, so the whole of it is testable in a
 * node environment. The component owns the interval that re-renders it; this
 * owns what the numbers mean.
 *
 * A hold is a *reason*, not a flag. Pointer and keyboard can both be on the
 * toast at once, and a mouse that leaves while focus stays must not restart
 * the clock, so `holds` is a list and the countdown runs only when it is
 * empty.
 */

/** Seconds the Undo button stays on screen. One exported constant. */
export const UNDO_WINDOW_SECONDS = 10;

const WINDOW_MS = UNDO_WINDOW_SECONDS * 1000;

/** Why the countdown is paused. */
export type CountdownHold = "hover" | "focus";

export type Countdown = {
  /** Milliseconds already spent running, excluding the current run. */
  elapsedMs: number;
  /** When the current run began, or null while the countdown is held. */
  runningSince: number | null;
  /** Every reason the countdown is currently paused. */
  holds: readonly CountdownHold[];
};

/** A full window, running from `now`. */
export function start(now: number): Countdown {
  return { elapsedMs: 0, runningSince: now, holds: [] };
}

/** Total milliseconds the countdown has run by `now`. */
function elapsed(countdown: Countdown, now: number): number {
  const current =
    countdown.runningSince === null ? 0 : Math.max(0, now - countdown.runningSince);
  return countdown.elapsedMs + current;
}

/**
 * Pauses the countdown. Adding a hold that is already there changes nothing:
 * a pointerenter that fires twice must not bank the elapsed time twice.
 */
export function hold(
  countdown: Countdown,
  reason: CountdownHold,
  now: number,
): Countdown {
  if (countdown.holds.includes(reason)) return countdown;

  return {
    elapsedMs: elapsed(countdown, now),
    runningSince: null,
    holds: [...countdown.holds, reason],
  };
}

/** Lets go of one reason. The countdown resumes only once none is left. */
export function release(
  countdown: Countdown,
  reason: CountdownHold,
  now: number,
): Countdown {
  if (!countdown.holds.includes(reason)) return countdown;

  const holds = countdown.holds.filter((held) => held !== reason);
  return {
    elapsedMs: countdown.elapsedMs,
    runningSince: holds.length === 0 ? now : null,
    holds,
  };
}

/** Whether the countdown is paused. */
export function isHeld(countdown: Countdown): boolean {
  return countdown.holds.length > 0;
}

/**
 * Whole seconds still on the clock, 0 to UNDO_WINDOW_SECONDS.
 *
 * Rounded up, so the label reads "10" the instant the toast appears and only
 * reaches "0" when the window has actually run out.
 */
export function secondsLeft(countdown: Countdown, now: number): number {
  const left = WINDOW_MS - elapsed(countdown, now);
  return Math.max(0, Math.ceil(left / 1000));
}

export function isExpired(countdown: Countdown, now: number): boolean {
  return elapsed(countdown, now) >= WINDOW_MS;
}
