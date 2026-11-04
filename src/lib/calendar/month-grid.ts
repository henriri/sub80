/** The Monday-first month grid: six rows of seven, with the spill days marked. */

import type { Ymd } from "@/lib/plan";
import { DAYS_IN_WEEK, MONTH_GRID_ROWS, monthRange } from "./range";

export type MonthCell = {
  date: Ymd;
  dayOfMonth: number;
  /** False for a leading or trailing day borrowed from the next month over. */
  inMonth: boolean;
};

export function monthGrid(date: Ymd): MonthCell[][] {
  const { start, end, days } = monthRange(date);

  const cells = days.map(
    (day): MonthCell => ({
      date: day,
      dayOfMonth: Number(day.slice(8, 10)),
      // 'YYYY-MM-DD' sorts as a date, so a string compare is the comparison.
      inMonth: day >= start && day <= end,
    }),
  );

  return Array.from({ length: MONTH_GRID_ROWS }, (_, row) =>
    cells.slice(row * DAYS_IN_WEEK, (row + 1) * DAYS_IN_WEEK),
  );
}
