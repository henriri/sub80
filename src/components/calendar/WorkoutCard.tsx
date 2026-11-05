"use client";

import { useDraggable } from "@dnd-kit/react";
import { formatKm, type CalendarItem } from "@/lib/calendar";
import { DRAG_INSTRUCTIONS } from "@/lib/ui/drag-announce";
import { KindBadge } from "./KindBadge";
import { useMove } from "./move-context";
import { focusRing, joinClasses } from "./styles";

type WorkoutCardProps = {
  item: CalendarItem;
  /** `compact` sits in a week column or a month cell; `full` is the day view. */
  size?: "compact" | "full";
};

const base = [
  "flex flex-col gap-(--cal-card-gap)",
  "min-h-(--cal-card-min-height)",
  "px-(--cal-card-padding-x) py-(--cal-card-padding-y)",
  "rounded-(--cal-card-radius) bg-(--cal-card-bg) text-(color:--cal-card-fg)",
  "border-(length:--border-width-default) border-(--cal-card-border)",
].join(" ");

/** A real touch target, not a grip: it has to work with a finger. */
const control = [
  "inline-flex min-h-touch min-w-touch items-center justify-center",
  "rounded-control border-(length:--border-width-default) border-default",
  "px-inline-sm text-small hover:bg-raised",
  focusRing,
].join(" ");

function KeySession() {
  return (
    <>
      {" "}
      <span aria-hidden="true">★</span>
      <span className="sr-only">(key session)</span>
    </>
  );
}

/**
 * The handle and the button that do the same job two ways.
 *
 * The handle is a `button`, so the keyboard sensor picks it up on space or
 * enter and so a finger has 44px to land on; the drag listeners go on it
 * rather than on the whole card, which keeps the card's own text selectable.
 * "Move to…" is the route for anyone who would rather not drag at all, and
 * the one that meets the touch-target rule in the month view, where a marker
 * cannot.
 */
function Controls({
  item,
  handleRef,
  isDragging,
  onPick,
  instructionsId,
}: {
  item: CalendarItem;
  handleRef: (element: Element | null) => void;
  isDragging: boolean;
  onPick: () => void;
  instructionsId: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-inline-sm">
      <button
        type="button"
        ref={handleRef}
        aria-describedby={instructionsId}
        aria-pressed={isDragging}
        className={joinClasses(control, "cursor-grab")}
      >
        <span aria-hidden="true">⠿</span>
        <span className="sr-only">Move {item.title}</span>
      </button>
      <button type="button" onClick={onPick} className={control}>
        Move to…
      </button>
      <p id={instructionsId} className="sr-only">
        {DRAG_INSTRUCTIONS}
      </p>
    </div>
  );
}

/**
 * One planned session.
 *
 * Draggable only when the calendar is interactive and the session is still
 * planned: a completed run is history, and `validateMove` refuses to move one,
 * so offering a handle for it would be a lie. Read-only -- on /design, and
 * anywhere the provider is absent -- it renders exactly as it did before.
 */
export function WorkoutCard({ item, size = "compact" }: WorkoutCardProps) {
  const move = useMove();
  const draggable = move !== null && move.canMove(item);

  const { ref, handleRef, isDragging } = useDraggable({
    id: item.id,
    data: { workoutId: item.id },
    disabled: !draggable,
  });

  return (
    <article
      ref={ref}
      id={`workout-${item.id}`}
      data-workout-id={item.id}
      className={joinClasses(
        base,
        size === "full" && "gap-stack-sm",
        // Lift, not colour: a card that has left its day has to look picked
        // up to someone who cannot tell the tints apart.
        isDragging && "shadow-(--cal-drag-overlay-shadow)",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-inline-sm">
        <KindBadge kind={item.kind} />
        {item.metres === null ? null : (
          <span className="text-small text-secondary">{formatKm(item.metres)}</span>
        )}
      </div>

      <h3 className={size === "full" ? "text-heading-sm" : "font-strong text-small"}>
        {item.title}
        {item.isKey ? <KeySession /> : null}
      </h3>

      {item.paceLabel === null ? null : (
        <p className="flex flex-wrap items-center gap-inline-sm text-small text-secondary">
          <span className="rounded-control bg-raised px-inline-sm font-code">
            {item.paceZone}
          </span>
          {item.paceLabel}
        </p>
      )}

      {item.strides ? (
        <p className="text-small text-secondary">
          {size === "full" ? "Finishes with strides." : "+ strides"}
        </p>
      ) : null}

      {draggable && move !== null ? (
        <Controls
          item={item}
          handleRef={handleRef}
          isDragging={isDragging}
          onPick={() => move.pick(item.id)}
          instructionsId={`drag-help-${item.id}`}
        />
      ) : null}
    </article>
  );
}
