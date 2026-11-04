/**
 * The calendar's URL state: `?view=week|month|day` and `?date=YYYY-MM-DD`.
 *
 * Both are optional. A missing view is a week, a missing date is today, and
 * anything else present but unreadable is a redirect back to the default, so a
 * hand-edited URL can never render a half-broken calendar.
 */

import { z } from "zod";
import type { Ymd } from "@/lib/plan";

export const CALENDAR_VIEWS = ["week", "month", "day"] as const;

export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export type CalendarParams = { view: CalendarView; date: Ymd };

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A date that exists. '2027-02-30' has the right shape, and `addDays` would
 * quietly roll it into March, so the shape alone is not enough.
 */
export function isValidYmd(value: string): boolean {
  const match = YMD.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Unknown keys are stripped; a repeated parameter arrives as an array and fails. */
const searchParamsSchema = z.object({
  view: z.enum(CALENDAR_VIEWS).optional(),
  date: z.string().refine(isValidYmd, "Expected a real YYYY-MM-DD date.").optional(),
});

export type RawSearchParams = Record<string, string | string[] | undefined>;

export type ParseResult =
  | { ok: true; params: CalendarParams }
  /** What to redirect to. Carried here so the caller needs one call, not two. */
  | { ok: false; fallback: CalendarParams };

/** The week containing today. */
export function defaultParams(today: Ymd): CalendarParams {
  return { view: "week", date: today };
}

export function parseCalendarParams(raw: RawSearchParams, today: Ymd): ParseResult {
  const parsed = searchParamsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fallback: defaultParams(today) };

  return {
    ok: true,
    params: { view: parsed.data.view ?? "week", date: parsed.data.date ?? today },
  };
}

/** Both values come from a closed set or a validated date, so neither needs escaping. */
export function calendarHref({ view, date }: CalendarParams): string {
  return `/?view=${view}&date=${date}`;
}
