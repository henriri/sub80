import type { MonthViewModel } from "@/lib/calendar";
import { MonthDayCell } from "./MonthDayCell";

type MonthViewProps = { month: MonthViewModel };

const grid = "grid grid-cols-7 gap-(--cal-cell-gap)";

/**
 * Monday-first, six rows, with the leading and trailing days greyed. The
 * weekday strip is decoration: every cell already names its own full date, so
 * repeating the weekday to a screen reader would only add noise.
 */
export function MonthView({ month }: MonthViewProps) {
  const headings = month.weeks[0] ?? [];

  return (
    <div className="flex flex-col gap-(--cal-cell-gap)">
      <div aria-hidden="true" className={grid}>
        {headings.map((day) => (
          <span
            key={day.date}
            className="px-(--cal-cell-padding) text-small text-(color:--cal-weekday-fg)"
          >
            {day.weekdayLabel}
          </span>
        ))}
      </div>

      <div className={grid}>
        {month.weeks.flat().map((day) => (
          <MonthDayCell key={day.date} day={day} />
        ))}
      </div>
    </div>
  );
}
