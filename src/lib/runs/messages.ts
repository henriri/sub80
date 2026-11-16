/**
 * The words for a refused run, for a warning the athlete must confirm, and for
 * the one factual line a linked run gets.
 *
 * Separate from ./rules.ts for the reason src/lib/calendar/move-messages.ts is
 * separate from src/lib/plan/moves.ts: a code is an identifier and a sentence
 * is copy, and the two should be free to change independently. A run warning's
 * code also travels to the server as a confirmation, so it is an identifier on
 * the wire as well.
 *
 * Framework free, like the rules.
 */

import { formatKm, formatDayName } from "@/lib/calendar";
import { fmtPace, fmtTime, zoneLabel, type Ymd, type ZoneKey } from "@/lib/plan";
import type { ResetWithheld } from "./deleting";
import { formatPacePerKm } from "./format";
import { HR_SOURCES, type HrSource, type RunReason, type RunWarning } from "./rules";
import type { PaceComparison } from "./zone";

/**
 * Why the run cannot be saved, in one sentence, addressed to the athlete.
 *
 * Each says what is wrong with what was typed rather than naming a rule. A
 * bare `switch` with no `default`, so a new code is a compile error here as
 * well as a test failure.
 */
export function runRejectMessage(reason: RunReason): string {
  switch (reason.code) {
    case "bad_date":
      return "Pick the day you ran.";
    case "future_date":
      return `${formatDayName(reason.date)} has not happened yet.`;
    case "bad_time":
      return "A start time looks like 07:30, or leave it empty.";
    case "bad_distance":
      return "Enter the distance in kilometres, like 7,5.";
    case "distance_range":
      return `A run is between ${formatKm(reason.minM)} and ${formatKm(reason.maxM)}.`;
    case "bad_duration":
      return "Enter the time as 42:30, 1:23:45, or a number of minutes.";
    case "duration_range":
      return `A run lasts between ${fmtTime(reason.minS)} and ${fmtTime(reason.maxS)}.`;
    case "pace_too_fast":
      return `That works out at ${formatPacePerKm(reason.pace)}, which is faster than anyone runs. Check the distance and the time.`;
    case "pace_too_slow":
      return `That works out at ${formatPacePerKm(reason.pace)}, which is slower than walking. Check the distance and the time.`;
    case "bad_hr":
      return "Enter the average heart rate as a whole number.";
    case "hr_range":
      return `An average heart rate is between ${reason.min} and ${reason.max}.`;
    case "hr_source_missing":
      return "Say where the heart rate came from. The two sources are never mixed.";
    case "hr_source_unexpected":
      return "Enter the heart rate too, or clear the source.";
    case "bad_hr_source":
      return "A heart rate comes from a chest strap or from the wrist.";
    case "bad_rpe":
      return "Pick an effort between 1 and 10.";
    case "rpe_range":
      return `An effort runs from ${reason.min} to ${reason.max}.`;
    case "notes_too_long":
      return `What you write is at most ${reason.max} characters.`;
  }
}

/** What the athlete is being asked to accept, in one sentence. */
export function runWarningMessage(warning: RunWarning): string {
  switch (warning.code) {
    case "pace_unusually_fast":
      return `${formatPacePerKm(warning.pace)} is quicker than ${fmtPace(warning.threshold)} a kilometre. Is the distance right?`;
    case "pace_unusually_slow":
      return `${formatPacePerKm(warning.pace)} is slower than ${fmtPace(warning.threshold)} a kilometre. Is the time right?`;
    case "workout_has_run":
      return warning.runs === 1
        ? "This session already has a run against it."
        : `This session already has ${warning.runs} runs against it.`;
  }
}

/**
 * The dialog's heading for a set of warnings. Several can apply at once, so
 * with more than one this names the shape of the decision rather than one of
 * them, as the move dialog does.
 */
export function runWarningTitle(warnings: readonly RunWarning[]): string {
  if (warnings.length > 1) return "Save this run anyway?";

  switch (warnings[0]?.code) {
    case "pace_unusually_fast":
    case "pace_unusually_slow":
      return "Is that pace right?";
    case "workout_has_run":
      return "Log a second run on this session?";
    default:
      return "Save this run?";
  }
}

/** 'chest strap' or 'wrist'. Said in full, because the two are never mixed. */
export function hrSourceLabel(source: HrSource): string {
  return source === "strap" ? "chest strap" : "wrist";
}

/** The plain wording for the effort scale, as the form offers it. */
export const RPE_BANDS = [
  { from: 1, to: 3, label: "easy" },
  { from: 4, to: 6, label: "moderate" },
  { from: 7, to: 8, label: "hard" },
  { from: 9, to: 10, label: "maximal" },
] as const;

/** 'moderate' for a 5. The band the score falls in, in one word. */
export function rpeBandLabel(rpe: number): string {
  const band = RPE_BANDS.find((candidate) => rpe >= candidate.from && rpe <= candidate.to);
  return band?.label ?? "";
}

/** '4 · moderate', for a list row. */
export function rpeLabel(rpe: number): string {
  return `${rpe} · ${rpeBandLabel(rpe)}`;
}

/**
 * One factual line about where the run fell:
 * '5:38 /km, within your Easy range 5:30 to 6:15'.
 *
 * A statement, not a verdict. It reports the pace, the side, and the window,
 * and says nothing about whether the run was good -- there is no score here
 * and will not be one until the phase that earns it.
 */
export function paceVsZoneLine(comparison: PaceComparison, zoneKey: ZoneKey): string {
  const window = `${zoneLabel(zoneKey)} range ${fmtPace(comparison.fast)} to ${fmtPace(comparison.slow)}`;

  switch (comparison.verdict) {
    case "within":
      return `${formatPacePerKm(comparison.pace)}, within your ${window}.`;
    case "faster":
      return `${formatPacePerKm(comparison.pace)}, faster than your ${window}.`;
    case "slower":
      return `${formatPacePerKm(comparison.pace)}, slower than your ${window}.`;
  }
}

/**
 * The sentence shown after a run is saved or removed.
 *
 * Named after what happened rather than after the function that did it, and
 * built from the stored numbers, so the confirmation says the same thing the
 * list row will say about the same run.
 */
export function runLoggedMessage(date: Ymd, metres: number): string {
  return `${formatKm(metres)} logged on ${formatDayName(date)}.`;
}

export function runUpdatedMessage(date: Ymd, metres: number): string {
  return `${formatKm(metres)} on ${formatDayName(date)} saved.`;
}

/** One option of a choice group: the value, the segment, and what is read out. */
export type RunChoice = { value: string; label: string; spokenLabel?: string };

/**
 * The ten effort segments.
 *
 * The segment shows only the number, because ten segments with a word in each
 * would not fit a phone. The word still reaches a screen reader through
 * `spokenLabel`, so "4" is read as "4, moderate" rather than as a bare digit
 * whose scale nobody explained.
 */
export function rpeChoices(): RunChoice[] {
  return RPE_BANDS.flatMap((band) =>
    Array.from({ length: band.to - band.from + 1 }, (_, offset) => {
      const score = band.from + offset;
      return {
        value: String(score),
        label: String(score),
        spokenLabel: `${score}, ${band.label}`,
      };
    }),
  );
}

/** '1–3 easy · 4–6 moderate · 7–8 hard · 9–10 maximal', under the segments. */
export function rpeBandsHint(): string {
  return RPE_BANDS.map((band) => `${band.from}–${band.to} ${band.label}`).join(" · ");
}

/**
 * Where the heart rate came from. Required as soon as a reading is entered,
 * because the two sources are never mixed or averaged.
 */
export function hrSourceChoices(): RunChoice[] {
  return HR_SOURCES.map((source) => ({
    value: source,
    // Capitalised: this is a segment the athlete taps, not a sentence.
    label: source === "strap" ? "Chest strap" : "Wrist",
  }));
}

/**
 * Why the dialog is not offering to put the session back, or null when there
 * is nothing worth saying.
 *
 * Only one of the three is worth a sentence. A run with no session, or one
 * whose session is not marked completed, has nothing to put back and silence
 * is the honest rendering -- explaining the absence of a checkbox nobody
 * expected is noise. A session another run still points at is different: the
 * athlete might reasonably expect the reset, so the dialog says why not.
 */
export function resetWithheldMessage(
  withheld: ResetWithheld,
  workoutTitle: string | null,
): string | null {
  switch (withheld) {
    case "no_link":
    case "not_completed":
      return null;
    case "other_runs":
      return workoutTitle === null
        ? "Another run is still linked to that session, so it keeps its status."
        : `Another run is still linked to ${workoutTitle}, so it keeps its status.`;
  }
}

/** The checkbox itself: what ticking it will do, named. */
export function resetCheckboxLabel(workoutTitle: string): string {
  return `Put ${workoutTitle} back to planned`;
}
