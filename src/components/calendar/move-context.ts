"use client";

import { createContext, useContext } from "react";
import type { CalendarItem } from "@/lib/calendar";
import type { MoveCheck, Ymd } from "@/lib/plan";

/**
 * What a card and a day cell need in order to take part in a move.
 *
 * It reaches them through a context rather than through props because the
 * calendar is three levels deep and the same components also render read-only,
 * on /design and in the day view. Threading `onMove` and a drag state down
 * would change every signature and force stub props on the specimen page; a
 * context whose default is null leaves the read-only path exactly as it was.
 *
 * Nothing here is authoritative. `check` is the same `validateMove` the Server
 * Action runs again against fresh rows, and it can only see the days the page
 * loaded, so a day at the edge of the window may come back clean here and
 * still need confirming once the server has looked at its neighbours.
 */
export type MoveApi = {
  /** Whether this session can be picked up at all. */
  canMove(item: CalendarItem): boolean;
  /** What would happen if the session landed on that day. */
  check(workoutId: string, toDate: Ymd): MoveCheck;
  /** The session currently being dragged, or null. */
  dragging: string | null;
  /** Open the "Move to…" picker: the route that needs no dragging. */
  pick(workoutId: string): void;
};

export const MoveContext = createContext<MoveApi | null>(null);

/** The move API, or null when the calendar is read-only. */
export function useMove(): MoveApi | null {
  return useContext(MoveContext);
}
