/**
 * The optimistic half of a move: the same change applied to the view model the
 * page is already rendering, so a dropped card lands before the server has
 * answered.
 *
 * Why the built model and not the rows
 * ------------------------------------
 * Rebuilding the model on the client would pull the plan generator, the VDOT
 * tables and three Intl formatters into the bundle, and it would buy nothing:
 * every view's window is whole plan weeks, so `weekIndex`, `title`,
 * `rangeLabel` and `plannedKm` are invariant under any move a view can
 * express. Only day membership, a day's distance, whether a day holds an
 * event, and the week's total can change -- which is how the week view's
 * running total updates before the round trip.
 *
 * This is a guess, not a decision. `validateMove` has already allowed the move
 * on the client and the Server Action re-runs it against fresh rows, so a move
 * this reducer applies can still be refused; `useOptimistic` then discards the
 * guess when the action returns without revalidating.
 *
 * Pure and framework free, like the rest of src/lib/calendar.
 */

import { nextFreeSlot, type Ymd } from "@/lib/plan";
import { DAYS_IN_WEEK } from "./range";
import { isEventKind } from "./kinds";
import {
  compareCalendarItems,
  sumMetres,
  type CalendarDay,
  type CalendarItem,
  type CalendarViewModel,
  type MonthDay,
} from "./view-model";

/** One pending move: the row id and where it is going. */
export type OptimisticMove = { workoutId: string; toDate: Ymd };

/** A day with its derived fields recomputed from a new set of items. */
function withItems<D extends CalendarDay>(day: D, items: CalendarItem[]): D {
  return {
    ...day,
    items,
    metres: sumMetres(items),
    isEvent: items.some((item) => isEventKind(item.kind)),
  };
}

/**
 * Applies the move across a flat list of days.
 *
 * Returns null when nothing changed, so the caller can hand back the very same
 * model object: an unknown workout id -- a move of a session that has since
 * scrolled out of the window -- must be a no-op rather than an empty day.
 */
function movedDays<D extends CalendarDay>(
  days: readonly D[],
  { workoutId, toDate }: OptimisticMove,
): D[] | null {
  const sourceIndex = days.findIndex((day) =>
    day.items.some((item) => item.id === workoutId),
  );
  if (sourceIndex === -1) return null;

  const source = days[sourceIndex] as D;
  if (source.date === toDate) return null;

  const moved = source.items.find((item) => item.id === workoutId) as CalendarItem;
  const next = [...days];
  next[sourceIndex] = withItems(
    source,
    source.items.filter((item) => item.id !== workoutId),
  );

  const destinationIndex = next.findIndex((day) => day.date === toDate);
  // Outside the loaded window: the "Move to…" picker can reach any day in the
  // plan, so the card leaving the view is the honest optimistic result.
  if (destinationIndex === -1) return next;

  const destination = next[destinationIndex] as D;
  // The slot the database will give it, from the one definition of that rule.
  const slot = nextFreeSlot(
    destination.items.map((item) => ({ day_slot: item.daySlot })),
  );
  const items = [
    ...destination.items,
    { ...moved, daySlot: slot ?? moved.daySlot },
  ].sort(compareCalendarItems);

  next[destinationIndex] = withItems(destination, items);
  return next;
}

const allItems = (days: readonly CalendarDay[]) => days.flatMap((day) => day.items);

/** Six rows of seven again, after a move that may have crossed rows. */
function chunk(days: readonly MonthDay[]): MonthDay[][] {
  return Array.from({ length: Math.ceil(days.length / DAYS_IN_WEEK) }, (_, row) =>
    days.slice(row * DAYS_IN_WEEK, (row + 1) * DAYS_IN_WEEK),
  );
}

/** The model with one move applied, or the same object when nothing changed. */
export function applyMove(
  model: CalendarViewModel,
  move: OptimisticMove,
): CalendarViewModel {
  switch (model.view) {
    case "week": {
      const days = movedDays(model.days, move);
      if (!days) return model;
      return { ...model, days, metres: sumMetres(allItems(days)) };
    }
    case "month": {
      const days = movedDays(model.weeks.flat(), move);
      if (!days) return model;
      return { ...model, weeks: chunk(days) };
    }
    case "day": {
      // One day, so a move can only take a session out of the view.
      const days = movedDays([model.day], move);
      if (!days) return model;
      return { ...model, day: days[0] as CalendarDay };
    }
  }
}

/** Every pending move, oldest first. */
export function applyMoves(
  model: CalendarViewModel,
  moves: readonly OptimisticMove[],
): CalendarViewModel {
  return moves.reduce(applyMove, model);
}
