/**
 * Where a run's pace fell relative to the zone it was aimed at.
 *
 * This is GROUNDWORK, not a score. It reports three facts -- the pace, the
 * window, and which side of it the pace is on -- and combines nothing. No RPE,
 * no duration, no heart rate, no weighting. The post-session questionnaire and
 * any effort score are later phases, and they will be built on top of this
 * rather than inside it.
 *
 * The window comes from `zoneRange` in src/lib/plan/vdot.ts, the same function
 * the calendar labels a session with, so a run and the session it belongs to
 * are judged by one definition of a zone.
 *
 * `vdot` is an argument because the honest comparison uses the VDOT that was
 * configured when the run was linked -- `activities.vdot_used` -- and not
 * today's. A run from a year ago was aimed at the paces of its own day.
 */

import { zoneRange, type ZoneKey } from "@/lib/plan";

/** Which side of the window the pace is on. `within` includes both edges. */
export type PaceVerdict = "faster" | "within" | "slower";

export type PaceComparison = {
  verdict: PaceVerdict;
  /** The run's pace, in seconds per kilometre. */
  pace: number;
  /** The fast edge of the window, so a smaller number than `slow`. */
  fast: number;
  slow: number;
  /** Race pace itself, for a race key. Absent for a training zone. */
  mid?: number;
  /**
   * Seconds per kilometre outside the window: negative when faster than the
   * fast edge, positive when slower than the slow edge, and 0 within it.
   * Signed so that "more positive is slower" holds everywhere.
   */
  deltaSec: number;
};

/**
 * The run's pace against its zone.
 *
 * Both edges count as within. A session asking for 5:30 to 6:15 and run at
 * exactly 6:15 did what it asked; treating the boundary as a miss would make
 * the window narrower than the one the athlete was shown.
 */
export function paceVsZone(
  paceSecPerKm: number,
  zoneKey: ZoneKey,
  vdot: number,
): PaceComparison {
  const { fast, slow, mid } = zoneRange(zoneKey, vdot);

  const verdict: PaceVerdict =
    paceSecPerKm < fast ? "faster" : paceSecPerKm > slow ? "slower" : "within";

  const deltaSec =
    verdict === "faster"
      ? paceSecPerKm - fast
      : verdict === "slower"
        ? paceSecPerKm - slow
        : 0;

  return mid === undefined
    ? { verdict, pace: paceSecPerKm, fast, slow, deltaSec }
    : { verdict, pace: paceSecPerKm, fast, slow, mid, deltaSec };
}
