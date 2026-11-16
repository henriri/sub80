/**
 * The words for every change the athlete can make to a planned workout, and
 * for the rules that refuse one.
 *
 * Separate from move-messages.ts, which is about one action: a drag, a drop
 * hint and the dialog that asks before a double day. This module is about the
 * change log -- one sentence per plan_events row -- plus the two newer rule
 * sets. `planEventMessage` moved here when it stopped being about moves.
 *
 * Framework free, like the rest of src/lib/calendar.
 *
 * Event kinds are STORED IDENTIFIERS, written by the SQL functions in
 * supabase/migrations. Reword a sentence here freely; never rename a kind to
 * suit one.
 */

import type { LightenReason, StatusReason, WorkoutStatus } from "@/lib/plan";
import { formatDayName, formatKm } from "./format";
import { rejectMessage } from "./move-messages";

/** Every kind an undo writes. `undo_move` is historical; nothing writes it now. */
export const UNDO_KINDS = ["undo_move", "undo_change"] as const;

/**
 * Every kind of change the athlete can make, and so every kind a sentence is
 * written for below. The message table is proved exhaustive against this list.
 */
export const UNDOABLE_EVENT_KINDS = [
  "move_workout",
  "edit_notes",
  "set_status",
  "lighten_workout",
  "restore_distance",
] as const;

export type UndoableEventKind = (typeof UNDOABLE_EVENT_KINDS)[number];

export function isUndoKind(kind: string): boolean {
  return (UNDO_KINDS as readonly string[]).includes(kind);
}

/**
 * The columns a change touched, as the event recorded them. Only the keys the
 * change actually wrote are present, which is why every field is optional:
 * reading one that is absent would be reading something the event never
 * claimed.
 */
export type ChangeSnapshot = {
  planned_date?: string;
  status?: WorkoutStatus;
  notes?: string | null;
  target_distance_m?: number | null;
  original_distance_m?: number | null;
};

/**
 * One row of "Recent changes", and the input to the toast's sentence.
 *
 * Structural rather than taking a `PlanEvent`, because that type lives in a
 * server-only module and this one has no business importing it. No payload
 * carries a title -- only the workout id -- so a row names the days, the
 * statuses and the distances, and never the session, rather than a second read
 * being done to make a sentence prettier.
 */
export type PlanEventSummary = {
  kind: string;
  status: string;
  /** A move's two days. Null for every other kind. */
  move: { from: string; to: string } | null;
  before: ChangeSnapshot | null;
  after: ChangeSnapshot | null;
  /** For an undo, the kind of change it reversed. */
  undoneKind?: string | null;
};

/** How a status reads in a sentence, which is not how it is stored. */
export function statusWord(status: WorkoutStatus): string {
  switch (status) {
    case "completed":
      return "done";
    case "skipped":
      return "skipped";
    case "planned":
      return "planned";
  }
}

const km = (metres: number | null | undefined): string =>
  metres === null || metres === undefined ? "no distance" : formatKm(metres);

/** What a note went from and to, which is more useful than the text itself. */
function notesSentence(event: PlanEventSummary): string {
  const had = event.before?.notes != null;
  const has = event.after?.notes != null;

  if (!had && has) return "Notes added.";
  if (had && !has) return "Notes cleared.";
  return "Notes changed.";
}

function changeSentence(event: PlanEventSummary): string {
  switch (event.kind) {
    case "move_workout":
      return event.move === null
        ? "Moved to another day."
        : `Moved from ${formatDayName(event.move.from)} to ${formatDayName(event.move.to)}.`;

    case "edit_notes":
      return notesSentence(event);

    case "set_status": {
      const to = event.after?.status;
      if (to === undefined) return "Status changed.";
      return to === "planned" ? "Back to planned." : `Marked ${statusWord(to)}.`;
    }

    case "lighten_workout":
      return `Lightened from ${km(event.before?.target_distance_m)} to ${km(
        event.after?.target_distance_m,
      )}.`;

    case "restore_distance":
      return `Planned distance restored: ${km(event.after?.target_distance_m)}.`;

    default:
      return "A plan change.";
  }
}

/**
 * What an undo put back.
 *
 * An undo's `after` is the snapshot the change it reverses recorded as its
 * `before`, so this reads the restored state out of the same field every other
 * kind reads its new state out of. `undoneKind` is what makes it a sentence
 * about notes rather than about a distance.
 */
function undoSentence(event: PlanEventSummary): string {
  const restored = event.after;

  switch (event.undoneKind) {
    case "move_workout":
      // A historical undo_move carries the move's days; a generic one carries
      // the date in its snapshot. Both say the same thing.
      return restored?.planned_date !== undefined
        ? `Put back on ${formatDayName(restored.planned_date)}.`
        : event.move === null
          ? "Put back."
          : `Put back on ${formatDayName(event.move.to)}.`;

    case "edit_notes":
      return "Notes put back.";

    case "set_status":
      return restored?.status === undefined
        ? "Status put back."
        : `Status put back to ${statusWord(restored.status)}.`;

    case "lighten_workout":
    case "restore_distance":
      return `Distance put back to ${km(restored?.target_distance_m)}.`;

    default:
      // A historical undo_move, written before undone_kind existed.
      return event.move === null
        ? "Change put back."
        : `Put back on ${formatDayName(event.move.to)}.`;
  }
}

/**
 * One row of "Recent changes", and the sentence the toast shows for a change
 * that has just been saved. One table for both, so what the toast says and
 * what the history says can never disagree.
 */
export function planEventMessage(event: PlanEventSummary): string {
  if (isUndoKind(event.kind)) return undoSentence(event);

  const sentence = changeSentence(event);
  return event.status === "undone" ? `${sentence} Undone.` : sentence;
}

/**
 * What the toast should say once the Undo button has been pressed, composed
 * before it is needed.
 *
 * An undo restores the change's `before`, so this is exactly the sentence the
 * undo event itself will carry -- built from the same table rather than from a
 * second one written to match.
 */
export function undoneChangeMessage(
  kind: string,
  restored: ChangeSnapshot | null,
): string {
  return planEventMessage({
    kind: "undo_change",
    status: "accepted",
    move: null,
    before: null,
    after: restored,
    undoneKind: kind,
  });
}

/**
 * Which row of a change list may be undone.
 *
 * Undo is a stack: the database accepts only the caller's newest accepted
 * change that is not itself an undo. So exactly one row carries the button,
 * and it is not always the first -- an undo, or an already undone change,
 * sits above it. Deriving it here, from the same rule `undo_plan_event`
 * applies, is what keeps the interface from offering what the database will
 * refuse.
 */
export function undoableIndex(
  events: readonly { kind: string; status: string }[],
): number {
  return events.findIndex(
    (event) => !isUndoKind(event.kind) && event.status === "accepted",
  );
}

/**
 * Undo is a stack, so an event that is no longer the newest undoable one is
 * refused. This says what to do instead rather than only that it failed.
 */
export const STALE_UNDO_MESSAGE =
  "Something else has changed since then. Undo the most recent change instead.";

/** Why a day cannot be made lighter, or its distance put back. */
export function lightenRejectMessage(reason: LightenReason): string {
  switch (reason.code) {
    case "not_planned":
      return reason.status === "completed"
        ? "This session is already done, so its distance is history."
        : "This session was skipped, so its distance is history.";
    case "in_past":
      return "This session is in the past. What happened has happened.";
    case "no_distance":
      return "This session has no distance to change.";
    case "already_minimum":
      return `This session is already down to ${formatKm(reason.metres)}, which is as short as a run gets.`;
    case "would_raise":
      return `This day is already down to ${formatKm(reason.fromM)}. Restore the planned distance first.`;
    case "no_original":
      return "This day is at its planned distance already.";
    // One sentence for the ceiling, shared with a move that would breach it.
    case "week_cap_exceeded":
      return rejectMessage(reason);
  }
}

/** Why a status cannot be changed. */
export function statusRejectMessage(reason: StatusReason): string {
  switch (reason.code) {
    case "already":
      return reason.status === "planned"
        ? "This session is already planned."
        : `This session is already marked ${statusWord(reason.status)}.`;
  }
}
