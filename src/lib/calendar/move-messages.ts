/**
 * The words for a rejected move and for a warning the athlete must confirm.
 *
 * Separate from src/lib/plan/moves.ts on purpose. The codes it produces are
 * persisted in plan_events.payload.overrides, so they are stored identifiers:
 * keeping the copy here means a dialog can be reworded freely without it
 * looking like a rule changed, and without the temptation to rename a code.
 *
 * Framework free, like the rest of src/lib/calendar.
 */

import type { MoveWarning, RejectReason } from "@/lib/plan";
import { formatFullDate, formatKm } from "./format";

/** 'Thursday 18 March 2027' without the year, which a dialog does not need. */
function dayName(date: string): string {
  return formatFullDate(date).replace(/ \d{4}$/, "");
}

/**
 * Why a move is not allowed, in one sentence, addressed to the athlete.
 *
 * Each says what stopped the move rather than naming a rule, because the
 * athlete is looking at a card that would not drop, not reading a rulebook.
 */
export function rejectMessage(reason: RejectReason): string {
  switch (reason.code) {
    case "not_planned":
      return reason.status === "completed"
        ? "This session is already done, so it cannot be moved."
        : "This session was skipped, so it cannot be moved.";
    case "same_date":
      return "This session is already on that day.";
    case "source_in_past":
      return "This session is in the past. What happened has happened.";
    case "destination_in_past":
      return `${dayName(reason.date)} has passed, so nothing can be planned on it.`;
    case "outside_plan":
      return `${dayName(reason.date)} is outside the plan.`;
    case "day_full":
      return `${dayName(reason.date)} already has ${reason.max} sessions.`;
    case "week_runs_exceeded":
      return `Week ${reason.weekIndex} would have ${reason.runs} runs, and ${reason.max} is the most in a week.`;
    case "week_cap_exceeded":
      return `Week ${reason.weekIndex} would reach ${formatKm(reason.metres)}, over the ${reason.capKm} km ceiling.`;
  }
}

/** What the athlete is being asked to accept, in one sentence. */
export function warningMessage(warning: MoveWarning): string {
  switch (warning.code) {
    case "double_day":
      return warning.bothKey
        ? `${dayName(warning.date)} would hold two key sessions: ${warning.other.title} and this one.`
        : `${dayName(warning.date)} would be a double day, alongside ${warning.other.title}.`;
    case "consecutive_key":
      return warning.side === "before"
        ? `${warning.neighbour.title} is the day before, on ${dayName(warning.neighbourDate)}, so two key sessions would fall back to back.`
        : `${warning.neighbour.title} is the day after, on ${dayName(warning.neighbourDate)}, so two key sessions would fall back to back.`;
  }
}

/**
 * The dialog's heading for a set of warnings. Several can apply at once, so
 * this names the shape of the decision rather than one of them.
 */
export function warningTitle(warnings: readonly MoveWarning[]): string {
  if (warnings.length > 1) return "Move this session anyway?";

  switch (warnings[0]?.code) {
    case "double_day":
      return "Make this a double day?";
    case "consecutive_key":
      return "Put two key sessions back to back?";
    default:
      return "Move this session?";
  }
}

/**
 * A word or two for a day cell that will not accept the workout being
 * dragged. The cell has room for a label and nothing more, so the full
 * sentence from `rejectMessage` goes to the live region instead.
 */
export function rejectHint(reason: RejectReason): string {
  switch (reason.code) {
    case "not_planned":
      return "Done";
    case "same_date":
      return "Here";
    case "source_in_past":
    case "destination_in_past":
      return "Past";
    case "outside_plan":
      return "Off plan";
    case "day_full":
      return "Full";
    case "week_runs_exceeded":
      return `${reason.max} runs`;
    case "week_cap_exceeded":
      return `${reason.capKm} km`;
  }
}
