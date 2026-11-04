import Link from "next/link";
import {
  calendarHref,
  describeDay,
  formatKmValue,
  type MonthDay,
} from "@/lib/calendar";
import { KindBadge } from "./KindBadge";
import { focusRing, joinClasses } from "./styles";

type MonthDayCellProps = { day: MonthDay };

const cell = [
  "flex min-h-(--cal-cell-min-size) flex-col gap-(--cal-cell-gap)",
  "p-(--cal-grid-cell-padding) rounded-(--cal-cell-radius)",
  "hover:bg-raised",
  focusRing,
].join(" ");

/** One string per state: two arbitrary values of one property would race. */
function surfaceClasses({ isToday, isEvent, inMonth }: MonthDay) {
  const background = isToday
    ? "bg-(--cal-today-bg)"
    : inMonth
      ? "bg-(--cal-cell-bg)"
      : "bg-(--cal-cell-bg-muted)";

  if (isToday) {
    return `${background} border-(length:--cal-today-ring-width) border-(--cal-today-ring)`;
  }
  if (isEvent) {
    return `${background} border-(length:--cal-today-ring-width) border-(--cal-event-border)`;
  }
  return `${background} border-(length:--border-width-default) border-(--cal-cell-border)`;
}

/**
 * A day in the month grid: the day number, a marker per session and the day's
 * distance. The whole cell is a link, which is what makes the grid keyboard
 * reachable, and `aria-label` gives it the full date rather than a bare number.
 */
export function MonthDayCell({ day }: MonthDayCellProps) {
  return (
    <Link
      href={calendarHref({ view: "day", date: day.date })}
      data-date={day.date}
      aria-current={day.isToday ? "date" : undefined}
      aria-label={describeDay(day)}
      className={joinClasses(cell, surfaceClasses(day))}
    >
      <span
        aria-hidden="true"
        className={joinClasses(
          "text-small",
          day.inMonth
            ? "text-(color:--cal-date-fg)"
            : "text-(color:--cal-date-fg-muted)",
          day.isToday && "font-strong",
        )}
      >
        {day.dayOfMonth}
      </span>

      {day.items.length === 0 ? null : (
        <span aria-hidden="true" className="flex flex-wrap gap-(--cal-grid-gap)">
          {day.items.map((item) => (
            <KindBadge key={item.id} kind={item.kind} size="short" />
          ))}
        </span>
      )}

      {day.metres > 0 ? (
        <span
          aria-hidden="true"
          className="mt-auto text-small text-(color:--cal-date-fg-muted)"
        >
          {formatKmValue(day.metres)}
        </span>
      ) : null}
    </Link>
  );
}
