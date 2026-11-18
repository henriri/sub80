"use client";

import { useDraggable, useDroppable } from "@dnd-kit/react";
import Link from "next/link";
import {
  KIND_META,
  calendarHref,
  describeDay,
  dropState,
  formatKmValue,
  isSessionDone,
  type CalendarItem,
  type MonthDay,
} from "@/lib/calendar";
import { DoneBadge } from "./DoneBadge";
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
 * The day number, which is the way to the day view.
 *
 * It replaced a link stretched across the whole cell. The cell now holds a
 * link per session, and two overlapping links -- one of them invisible and
 * covering the other -- is a trap however the z-indexes are arranged. A date
 * that is its own target is also easier to explain: the number goes to the
 * day, the session goes to the session.
 */
const dateLink = [
  "flex min-h-touch items-center self-start rounded-control",
  "px-inline-sm text-small hover:underline",
  focusRing,
].join(" ");

/**
 * One session's row: the link that opens it, full width and a real touch
 * target, with the drag handle beside it.
 */
const sessionRow = "flex items-center gap-(--cal-grid-gap)";

const sessionLink = [
  "flex min-h-touch min-w-0 flex-1 items-center gap-(--cal-grid-gap)",
  "rounded-control px-inline-sm text-small hover:underline",
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
 * A session in the month grid: the link that opens it, and the handle that
 * drags it.
 *
 * The link is the 44px target -- it spans the cell, so the width a seven-column
 * grid leaves is not the constraint. The handle stays smaller than 44px, as it
 * already did: at 360px a cell is about that wide, so two full-size targets
 * side by side do not exist, and the handle is the enhancement while the link
 * is the way in. It is still keyboard reachable and still carries its own
 * name, and both the week view's card and the day view give the same session a
 * full-size handle.
 *
 * The two are siblings, never nested: an interactive element may not be inside
 * a link, and a drag handle is interactive.
 */
function Session({ item }: { item: CalendarItem }) {
  const move = useMove();
  const draggable = move !== null && move.canMove(item);
  const done = isSessionDone(item);
  const { ref, handleRef, isDragging } = useDraggable({
    id: item.id,
    data: { workoutId: item.id },
    disabled: !draggable,
  });

  return (
    <span
      ref={ref}
      className={joinClasses(
        sessionRow,
        isDragging && "shadow-(--cal-drag-overlay-shadow)",
      )}
    >
      <Link href={item.href} className={sessionLink}>
        {/*
          One marker, not two: at seven columns on a phone a cell is about 45px
          wide and there is room for a single glyph. A finished session takes
          the done marker -- filled, with a check, where the kind marker is a
          pale tint with a letter -- so the change from planned to done is a
          change of shape and glyph and not only of colour. The kind is not lost
          with the letter: the marker speaks it, and the cell's own accessible
          name says the kinds and how many are done.
        */}
        {done ? (
          <DoneBadge size="short" kindLabel={KIND_META[item.kind].label} />
        ) : (
          <span aria-hidden="true">
            <KindBadge kind={item.kind} size="short" />
          </span>
        )}
        <span className="truncate">{item.title}</span>
      </Link>

      {draggable ? (
        <button
          type="button"
          ref={handleRef}
          aria-pressed={isDragging}
          className={joinClasses("block rounded-(--cal-marker-radius)", focusRing)}
        >
          <span aria-hidden="true">⠿</span>
          <span className="sr-only">Move {item.title}</span>
        </button>
      ) : null}
    </span>
  );
}

/**
 * A day in the month grid: the day number, a row per session and the day's
 * distance. While a session is being dragged the distance gives way to the
 * drop glyph, because the foot of a cell has room for one of them and not
 * both.
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
        className={joinClasses(
          dateLink,
          day.inMonth
            ? "text-(color:--cal-date-fg)"
            : "text-(color:--cal-date-fg-muted)",
          day.isToday && "font-strong",
        )}
      >
        <span aria-hidden="true">{day.dayOfMonth}</span>
      </Link>

      {day.items.length === 0 ? null : (
        <span className="flex flex-col gap-(--cal-grid-gap)">
          {day.items.map((item) => (
            <Session key={item.id} item={item} />
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
