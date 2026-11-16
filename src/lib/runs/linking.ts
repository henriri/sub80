/**
 * Which planned sessions the form offers to link a run to. Pure and framework
 * free.
 *
 * Two windows, for one reason. The form's date can be changed after the page
 * has loaded, and the sessions on offer have to follow it without a round trip
 * to the server, so the page reads a WIDE window once and this narrows it to
 * the three days either side of whatever date is currently in the field.
 *
 * Neither window is a rule. `log_run` will link a run to any session the
 * athlete owns, whatever its date; this is a shortlist, not a constraint. A
 * session further away is reachable by changing the date, which is the same
 * gesture that would have been needed anyway.
 */

import { diffDays, type Ymd } from "@/lib/plan";
import type { LinkableWorkout } from "./schemas";

/** How far either side of the run's date a session is offered. */
export const LINK_WINDOW_DAYS = 3;

/**
 * How far either side the page reads, so the field can be moved by up to a
 * week before the shortlist runs out and the page has to be asked again.
 */
export const PICKER_WINDOW_DAYS = 10;

/** The sessions within three days of `date`, nearest day first. */
export function linkableOn(
  workouts: readonly LinkableWorkout[],
  date: Ymd,
  withinDays: number = LINK_WINDOW_DAYS,
): LinkableWorkout[] {
  return workouts
    .filter((workout) => Math.abs(diffDays(date, workout.planned_date)) <= withinDays)
    .slice()
    .sort((a, b) => {
      // Nearest the run's own date first: that is almost always the one meant.
      const byDistance =
        Math.abs(diffDays(date, a.planned_date)) -
        Math.abs(diffDays(date, b.planned_date));
      if (byDistance !== 0) return byDistance;
      // Then chronologically, so two equally distant days read in order.
      return a.planned_date < b.planned_date ? -1 : 1;
    });
}

/**
 * Whether a chosen session is still on the shortlist for the chosen date.
 *
 * Moving the date can take the run away from the session it was pointed at.
 * The link is NOT dropped when that happens -- a run three days either side of
 * a session is still plausibly that session, and silently unlinking would
 * throw away something the athlete chose -- but the form says so.
 */
export function isLinkFar(
  workouts: readonly LinkableWorkout[],
  date: Ymd,
  chosenId: string | null,
): boolean {
  if (chosenId === null) return false;

  const chosen = workouts.find((workout) => workout.id === chosenId);
  if (chosen === undefined) return false;

  return Math.abs(diffDays(date, chosen.planned_date)) > LINK_WINDOW_DAYS;
}

/**
 * The "Log this run" link for a planned session.
 *
 * Carries the day and the planned distance, so the athlete does not retype
 * what the plan already knows. Both are a STARTING POINT, not a measurement:
 * the distance is what the session asked for, and correcting it is the normal
 * case rather than an exception. /runs/new re-checks each one and falls back to
 * a default rather than putting nonsense in a field.
 *
 * A session in the future keeps its date here; /runs/new clamps it to today,
 * because a run cannot be logged before it has happened.
 */
export function logRunHref(workout: {
  id: string;
  planned_date: Ymd;
  target_distance_m: number | null;
}): string {
  const params = new URLSearchParams({ workout: workout.id, date: workout.planned_date });

  if (workout.target_distance_m !== null) {
    params.set("distance", String(workout.target_distance_m / 1000));
  }

  return `/runs/new?${params.toString()}`;
}
