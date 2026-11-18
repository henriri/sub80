"use client";

import { useDraggable } from "@dnd-kit/react";
import Link from "next/link";
import { formatKm, isSessionDone, type CalendarItem } from "@/lib/calendar";
import { actualOverPlanned, doneFacts } from "@/lib/runs";
import { DRAG_INSTRUCTIONS } from "@/lib/ui/drag-announce";
import { DoneBadge } from "./DoneBadge";
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
  "rounded-(--cal-card-radius)",
  "border-(length:--border-width-default)",
].join(" ");

/** One string per state: two arbitrary values of one property would race. */
const surface = {
  planned: "bg-(--cal-card-bg) text-(color:--cal-card-fg) border-(--cal-card-border)",
  done: "bg-(--cal-done-bg) text-(color:--cal-card-fg) border-(--cal-done-border)",
} as const;

/**
 * The link fills the heading and underlines on hover, so it reads as the way
 * in without needing a second affordance. `rounded-control` is only there to
 * keep the focus ring off the text's corners.
 */
const title = "inline-block rounded-control hover:underline";

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
 * One planned session, and what happened on it.
 *
 * A run logged against it is what makes it done, so a done card reads as a
 * record rather than a plan: the check badge and the tint say so, and the
 * distance becomes what was actually run over what was asked for. In the day
 * view, where there is room, the numbers of the run ARE the content and the
 * plan's target drops to one small line beneath. No verdict is passed on any of
 * it -- the card states both numbers and the athlete reads the difference.
 *
 * Draggable only when the calendar is interactive and `sessionActions` says the
 * session can move: a day that has come is history, a session with a run
 * against it is finished, and the rules refuse to move either -- so offering a
 * handle would be a lie. Read-only -- on /design, and anywhere the provider is
 * absent -- it renders exactly as it did before.
 *
 * The handle is a real 44px target. So is "Move to…", which is the route for
 * anyone who would rather not drag at all.
 */
export function WorkoutCard({ item, size = "compact" }: WorkoutCardProps) {
  const move = useMove();
  const draggable = move !== null && move.canMove(item);
  const done = isSessionDone(item);
  const facts = doneFacts(item.runs);

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
        surface[done ? "done" : "planned"],
        size === "full" && "gap-stack-sm",
        // Lift, not colour: a card that has left its day has to look picked
        // up to someone who cannot tell the tints apart.
        isDragging && "shadow-(--cal-drag-overlay-shadow)",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-inline-sm">
        <span className="flex flex-wrap items-center gap-inline-sm">
          <KindBadge kind={item.kind} />
          {done ? <DoneBadge /> : null}
        </span>

        {facts === null ? (
          item.metres === null ? null : (
            <span className="text-small text-secondary">{formatKm(item.metres)}</span>
          )
        ) : (
          <span className="font-strong text-small">
            {actualOverPlanned(facts.metres, item.metres)}
          </span>
        )}
      </div>

      {/*
        The title is the link, and the only one on the card. It is a sibling of
        the drag handle rather than wrapping it: an interactive element may not
        be nested inside a link, and a drag handle is interactive.
      */}
      <h3 className={size === "full" ? "text-heading-sm" : "font-strong text-small"}>
        <Link href={item.href} className={joinClasses(title, focusRing)}>
          {item.title}
          {item.isKey ? <KeySession /> : null}
        </Link>
      </h3>

      {/*
        The day view of a finished session: what was run, then what was asked
        for. Several runs on one session sum their distance and time; the heart
        rate and the effort are then left off rather than averaged, because a
        strap reading and a wrist one are never mixed.
      */}
      {size === "full" && facts !== null ? (
        <>
          <p className="flex flex-wrap items-baseline gap-inline-md text-body">
            <span className="font-strong">{facts.distanceLabel}</span>
            <span>{facts.timeLabel}</span>
            <span className="text-secondary">{facts.paceLabel}</span>
            {facts.hrLabel ? (
              <span className="text-small text-secondary">
                {facts.hrLabel} ({facts.hrSourceLabel})
              </span>
            ) : null}
            {facts.rpeLabel ? (
              <span className="text-small text-secondary">{facts.rpeLabel}</span>
            ) : null}
          </p>

          {facts.runs > 1 ? (
            <p className="text-small text-secondary">
              {facts.runs} runs logged against this session.
            </p>
          ) : null}

          <p className="text-small text-secondary">
            Planned{item.metres === null ? "" : `: ${formatKm(item.metres)}`}
            {item.paceLabel === null ? "" : ` · ${item.paceZone} ${item.paceLabel}`}
          </p>
        </>
      ) : null}

      {/*
        What the session asks for. Dropped from a finished card in the day view,
        where the line above has already said it in full.
      */}
      {item.paceLabel === null || (size === "full" && facts !== null) ? null : (
        <p className="flex flex-wrap items-center gap-inline-sm text-small text-secondary">
          <span className="rounded-control bg-raised px-inline-sm font-code">
            {item.paceZone}
          </span>
          {item.paceLabel}
        </p>
      )}

      {item.strides && !done ? (
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
