/**
 * What a screen reader hears during a drag.
 *
 * These sentences are ours rather than dnd-kit's. Its accessibility plugin
 * announces that an item was "moved over" a target, which here would be a bare
 * date with no word about whether the session may land on it -- and that is
 * the only thing the athlete needs to know mid-drag. Keeping the copy in a
 * pure module also means a dnd-kit upgrade cannot quietly change it.
 *
 * `CalendarBoard` turns these off in the plugin and renders the strings into
 * its own live region, so nothing is said twice.
 */

import {
  dropState,
  formatFullDate,
  rejectMessage,
  warningMessage,
} from "@/lib/calendar";
import type { MoveCheck, Ymd } from "@/lib/plan";

/**
 * The instructions a draggable card is described by. Replaces dnd-kit's,
 * which talks about a sortable list rather than a calendar.
 */
export const DRAG_INSTRUCTIONS =
  "Press space or enter to pick up this session. Use the arrow keys to choose a day, " +
  "space or enter to drop it, escape to cancel. The Move to button does the same " +
  "thing without dragging.";

export function announceDragStart(title: string, date: Ymd): string {
  return `Picked up ${title} from ${formatFullDate(date)}. Use the arrow keys to choose a day.`;
}

/**
 * The sentence for the day currently under the session: the date, then whether
 * it may be dropped there and why not.
 */
export function announceDragOver(date: Ymd, check: MoveCheck): string {
  const day = formatFullDate(date);

  if (!check.ok) return `${day}. Cannot drop here: ${rejectMessage(check.reason)}`;
  if (check.warnings.length === 0) return `${day}. Drop to move here.`;

  const reasons = check.warnings.map(warningMessage).join(" ");
  return `${day}. Drop to move here, with a question first: ${reasons}`;
}

/** Nothing under the session, which is also worth saying. */
export function announceDragOverNothing(): string {
  return "Not over a day. Use the arrow keys to choose one.";
}

export function announceDragCancel(title: string): string {
  return `Cancelled. ${title} has not moved.`;
}

/**
 * The sentence for a drop. Saying it here, rather than waiting for the Server
 * Action, matches what the athlete sees: the card has already moved.
 */
export function announceDrop(title: string, date: Ymd, check: MoveCheck): string {
  if (!check.ok) return `${title} was not moved. ${rejectMessage(check.reason)}`;
  return dropState(check) === "warning"
    ? `${title} dropped on ${formatFullDate(date)}. Confirm the move to save it.`
    : `${title} moved to ${formatFullDate(date)}.`;
}
