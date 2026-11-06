"use client";

import { useDraggable, useDroppable } from "@dnd-kit/react";
import Link from "next/link";
import {
  calendarHref,
  describeDay,
  dropState,
  formatKmValue,
  type CalendarItem,
  type MonthDay,
} from "@/lib/calendar";
import { DropHint, dropSurfaceClasses } from "./DropHint";
import { KindBadge } from "./KindBadge";
import { useMove } from "./move-context";
import { focusRing, joinClasses } from "./styles";

type MonthDayCellProps = { day: MonthDay };

const cell = [
  "relative flex min-h-(--cal-cell-min-size) flex-col gap-(--cal-cell-gap)",
  "p-(--cal-grid-cell-padding) rounded-(--cal-cell-radius)",
].join(" ");

/**
 * The link that fills the cell. It is a sibling of the markers rather than
 * their parent, because an interactive element may not be nested inside a
 * link, and a drag handle is interactive. Still exactly one link per cell, in
 * the same place in the DOM order, with the same accessible name.
 */
const stretchedLink = ["absolute rounded-(--cal-cell-radius)", focusRing].join(" ");

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
 * A session's marker in the month grid, draggable by itself.
 *
 * In a seven-column grid at 360px this cannot be a 44px target, which is why
 * it is an enhancement and not the only way out of a month cell: the cell's
 * own link reaches the day view in one tap, and a card there has the "Move
 * to…" button. `z-10` puts it over the stretched link so a press lands on the
 * marker and not on the navigation underneath.
 */
function Marker({ item }: { item: CalendarItem }) {
  const move = useMove();
  const draggable = move !== null && move.canMove(item);
  const { ref, handleRef, isDragging } = useDraggable({
    id: item.id,
    data: { workoutId: item.id },
    disabled: !draggable,
  });

  // Read-only, the marker is decoration: the cell's link already names every
  // session on the day, so repeating them would only add noise.
  if (!draggable) {
    return (
      <span aria-hidden="true">
        <KindBadge kind={item.kind} size="short" />
      </span>
    );
  }

  return (
    <span
      ref={ref}
      className={joinClasses(
        "relative z-10",
        isDragging && "shadow-(--cal-drag-overlay-shadow)",
      )}
    >
      <button
        type="button"
        ref={handleRef}
        aria-pressed={isDragging}
        className={joinClasses("block rounded-(--cal-marker-radius)", focusRing)}
      >
        <span aria-hidden="true">
          <KindBadge kind={item.kind} size="short" />
        </span>
        <span className="sr-only">Move {item.title}</span>
      </button>
    </span>
  );
}

/**
 * A day in the month grid: the day number, a marker per session and the day's
 * distance. While a session is being dragged the distance gives way to the
 * drop glyph, because a 44px square has room for one of them and not both.
 */
export function MonthDayCell({ day }: MonthDayCellProps) {
  const move = useMove();
  const { ref, isDropTarget } = useDroppable({
    id: day.date,
    data: { date: day.date },
  });

  const check = move?.dragging ? move.check(move.dragging, day.date) : null;

  return (
    <div
      ref={ref}
      data-date={day.date}
      className={joinClasses(
        cell,
        check
          ? dropSurfaceClasses(dropState(check), isDropTarget)
          : surfaceClasses(day),
      )}
    >
      <Link
        href={calendarHref({ view: "day", date: day.date })}
        aria-current={day.isToday ? "date" : undefined}
        aria-label={describeDay(day)}
        className={stretchedLink}
        style={{ inset: 0 }}
      />

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
        <span className="flex flex-wrap gap-(--cal-grid-gap)">
          {day.items.map((item) => (
            <Marker key={item.id} item={item} />
          ))}
        </span>
      )}

      {check ? (
        <span className="mt-auto">
          <DropHint check={check} size="cell" />
        </span>
      ) : day.metres > 0 ? (
        <span
          aria-hidden="true"
          className="mt-auto text-small text-(color:--cal-date-fg-muted)"
        >
          {formatKmValue(day.metres)}
        </span>
      ) : null}
    </div>
  );
}
