import Link from "next/link";
import { calendarHref, describeDay, formatKm, type CalendarDay } from "@/lib/calendar";
import { CalendarEmpty } from "./CalendarEmpty";
import { WorkoutCard } from "./WorkoutCard";
import { focusRing, joinClasses } from "./styles";

type DayColumnProps = { day: CalendarDay };

const column = [
  "flex flex-col gap-(--cal-cell-gap)",
  "p-(--cal-cell-padding) rounded-(--cal-cell-radius)",
].join(" ");

const heading = [
  "flex min-h-touch items-baseline justify-between gap-inline-sm",
  "rounded-control px-inline-sm text-small text-(color:--cal-date-fg)",
  "hover:bg-raised",
  focusRing,
].join(" ");

/**
 * Background and border in one string each, rather than a base plus an
 * override: two arbitrary values of the same property would race in the
 * generated stylesheet, where class order carries no weight.
 */
function surfaceClasses({ isToday, isEvent }: CalendarDay) {
  const background = isToday ? "bg-(--cal-today-bg)" : "bg-(--cal-cell-bg)";

  if (isToday) {
    return `${background} border-(length:--cal-today-ring-width) border-(--cal-today-ring)`;
  }
  if (isEvent) {
    return `${background} border-(length:--cal-today-ring-width) border-(--cal-event-border)`;
  }
  return `${background} border-(length:--border-width-default) border-(--cal-cell-border)`;
}

/**
 * One day of the week view: a heading that opens the day view, then the day's
 * sessions. `data-date` is the drop target drag and drop will need.
 */
export function DayColumn({ day }: DayColumnProps) {
  const headingId = `day-${day.date}`;

  return (
    <section
      data-date={day.date}
      aria-labelledby={headingId}
      className={joinClasses(column, surfaceClasses(day))}
    >
      <h2 id={headingId}>
        <Link
          href={calendarHref({ view: "day", date: day.date })}
          aria-current={day.isToday ? "date" : undefined}
          aria-label={describeDay(day)}
          className={heading}
        >
          <span>
            <span className={day.isToday ? "font-strong" : undefined}>
              {day.weekdayLabel}
            </span>{" "}
            <span className="text-(color:--cal-date-fg-muted)">
              {Number(day.date.slice(8, 10))}
            </span>
          </span>
          {day.metres > 0 ? (
            <span className="text-(color:--cal-date-fg-muted)">
              {formatKm(day.metres)}
            </span>
          ) : null}
        </Link>
      </h2>

      {day.items.length === 0 ? (
        <CalendarEmpty inPlan={day.inPlan} />
      ) : (
        day.items.map((item) => <WorkoutCard key={item.id} item={item} />)
      )}
    </section>
  );
}
