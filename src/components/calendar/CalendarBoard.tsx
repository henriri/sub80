"use client";

import {
  Accessibility,
  PointerActivationConstraints,
  PointerSensor,
} from "@dnd-kit/dom";
import { DragDropProvider } from "@dnd-kit/react";
import {
  startTransition,
  useCallback,
  useMemo,
  useOptimistic,
  useReducer,
  useState,
} from "react";
import {
  moveWorkout,
  undoLastMove,
  type MoveResult,
  type UndoResult,
} from "@/app/actions";
import {
  STALE_UNDO_MESSAGE,
  applyMove,
  movedMessage,
  rejectMessage,
  undoneMessage,
  type CalendarItem,
  type CalendarViewModel,
} from "@/lib/calendar";
import {
  validateMove,
  type MoveCandidate,
  type MoveCheck,
  type MoveWarning,
  type Ymd,
} from "@/lib/plan";
import {
  announceDragCancel,
  announceDragOver,
  announceDragOverNothing,
  announceDragStart,
  announceDrop,
} from "@/lib/ui/drag-announce";
import { idle, moveFeedback } from "@/lib/ui/move-feedback";
import { DayView } from "./DayView";
import { MonthView } from "./MonthView";
import { MoveDialog } from "./MoveDialog";
import { MovePicker } from "./MovePicker";
import { UndoToast } from "./UndoToast";
import { WeekView } from "./WeekView";
import { MoveContext, type MoveApi } from "./move-context";

type CalendarBoardProps = {
  model: CalendarViewModel;
  /** Today in Europe/Paris, computed on the server. */
  today: Ymd;
  /**
   * The Server Action, overridable.
   *
   * Only /design passes anything here: a specimen page has no session, so the
   * real action would redirect to the login form the moment a card landed,
   * and a drag that cannot be completed is not a specimen of a drag. The
   * calendar on `/` takes the default and never names an action of its own.
   */
  onMove?: MoveAction;
  /** Overridable for the same reason as `onMove`. */
  onUndo?: UndoAction;
};

/**
 * The two actions, spelled out rather than written as `typeof moveWorkout`.
 *
 * The real actions take `unknown` and validate it, which is right for a
 * boundary the browser can post anything to, but it would make every
 * substitute take `unknown` too. Both of these are assignable to the real
 * signature, so nothing is loosened.
 */
export type MoveAction = (input: {
  workoutId: string;
  toDate: Ymd;
  overrides: readonly MoveWarning["code"][];
}) => Promise<MoveResult>;

export type UndoAction = (eventId: string) => Promise<UndoResult>;

/** A move the athlete still has to confirm, and what it would cause. */
type PendingMove = {
  workoutId: string;
  toDate: Ymd;
  warnings: readonly MoveWarning[];
};

/** Every day in a model, whichever view it is. */
function daysOf(model: CalendarViewModel) {
  switch (model.view) {
    case "week":
      return model.days;
    case "month":
      return model.weeks.flat();
    case "day":
      return [model.day];
  }
}

/**
 * The rows the rules run against, read back out of the rendered model.
 *
 * Deliberately not a second prop from the server: while a move is pending the
 * optimistic model is what is on screen, and a separate list of rows would
 * still have the session on its old day, so a second drag would be checked
 * against a calendar nobody is looking at.
 */
function candidatesOf(model: CalendarViewModel): MoveCandidate[] {
  return daysOf(model).flatMap((day) =>
    day.items.map((item) => ({
      id: item.id,
      planned_date: day.date,
      target_distance_m: item.metres,
      is_key: item.isKey,
      status: item.status,
      day_slot: item.daySlot,
      title: item.title,
    })),
  );
}

/**
 * A press and hold on touch, a short drag with a mouse.
 *
 * Without the delay a swipe that begins on a card would drag the card instead
 * of scrolling the page, which on a phone makes the calendar unusable. A mouse
 * needs no delay, only enough distance that a click is not a drag.
 */
const activationConstraints = (event: PointerEvent) =>
  event.pointerType === "touch"
    ? [new PointerActivationConstraints.Delay({ value: 250, tolerance: 5 })]
    : [new PointerActivationConstraints.Distance({ value: 5 })];

/**
 * The interactive calendar: the same three views, with the sessions draggable
 * and the days able to receive them.
 *
 * It owns the optimistic model, so a dropped card lands at once and the week
 * total moves with it. The server is still the authority: `moveWorkout` runs
 * the same rules again over fresh rows, and when it refuses, nothing
 * revalidates, React discards the guess and the card snaps back. The message
 * therefore lives in state of its own, so it survives that snap back.
 */
export function CalendarBoard({
  model,
  today,
  onMove = moveWorkout,
  onUndo = undoLastMove,
}: CalendarBoardProps) {
  const [optimistic, addMove] = useOptimistic(model, applyMove);
  const [feedback, send] = useReducer(moveFeedback, idle);
  const [dragging, setDragging] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [picking, setPicking] = useState<string | null>(null);

  const candidates = useMemo(() => candidatesOf(optimistic), [optimistic]);

  const check = useCallback(
    (workoutId: string, toDate: Ymd): MoveCheck => {
      const workout = candidates.find((candidate) => candidate.id === workoutId);
      // Not on screen any more. Claim nothing about it and let the server,
      // which can still see the row, decide.
      if (!workout) return { ok: true, warnings: [] };
      return validateMove({ workout, toDate, weekWorkouts: candidates, today });
    },
    [candidates, today],
  );

  const titleOf = useCallback(
    (workoutId: string) =>
      candidates.find((candidate) => candidate.id === workoutId)?.title ??
      "This session",
    [candidates],
  );

  const commit = useCallback(
    (workoutId: string, toDate: Ymd, overrides: readonly MoveWarning["code"][]) => {
      startTransition(async () => {
        addMove({ workoutId, toDate });
        const result = await onMove({ workoutId, toDate, overrides });

        if (result.status === "ok") {
          send({
            type: "moved",
            eventId: result.eventId,
            workoutId: result.workoutId,
            title: result.title,
            from: result.from,
            message: movedMessage(result.title, result.to),
            now: Date.now(),
          });
          return;
        }

        // The client could not see the whole picture -- a day at the edge of
        // the loaded window, or a picker reaching outside it altogether -- so
        // the question arrives after the attempt rather than before it. The
        // card has already snapped back by now, which is the honest picture:
        // nothing has been saved until this is answered.
        if (result.status === "needs_confirmation") {
          setPending({ workoutId, toDate, warnings: result.warnings });
          return;
        }

        send({ type: "error", message: result.message });
      });
    },
    [addMove, onMove],
  );

  const request = useCallback(
    (workoutId: string, toDate: Ymd) => {
      const outcome = check(workoutId, toDate);
      if (!outcome.ok) {
        send({ type: "error", message: rejectMessage(outcome.reason) });
        return;
      }
      // Asked before the move rather than after it, so a card the athlete may
      // decide against never appears to have landed.
      if (outcome.warnings.length > 0) {
        setPending({ workoutId, toDate, warnings: outcome.warnings });
        return;
      }
      commit(workoutId, toDate, []);
    },
    [check, commit],
  );

  const undo = useCallback(
    (eventId: string) => {
      startTransition(async () => {
        const restored =
          feedback.kind === "moved"
            ? undoneMessage(feedback.title, feedback.from)
            : "That change has been put back.";

        const result = await onUndo(eventId);
        if (result.status === "ok") {
          send({ type: "undone", message: restored });
          return;
        }
        // The only way the database refuses an undo the interface offered is
        // that something has changed since: another move, or the session
        // having moved on again. Its own message names a row id, which is no
        // use to the athlete, so this says what to do instead.
        send({ type: "error", message: STALE_UNDO_MESSAGE });
      });
    },
    [feedback, onUndo],
  );

  const api = useMemo<MoveApi>(
    () => ({
      canMove: (item: CalendarItem) => item.status === "planned",
      check,
      dragging,
      pick: setPicking,
    }),
    [check, dragging],
  );

  const pickingFrom = candidates.find((candidate) => candidate.id === picking);

  return (
    <MoveContext.Provider value={api}>
      <DragDropProvider
        // An array would replace the defaults and silently lose the keyboard
        // sensor, so the pointer sensor is swapped out of them by identity.
        sensors={(defaults) => [
          PointerSensor.configure({ activationConstraints }),
          ...defaults.filter((sensor) => sensor !== PointerSensor),
        ]}
        // dnd-kit's accessibility plugin announces the target by name only.
        // Mid-drag the useful thing is whether the day will take the session
        // and why not, which is what the live region below says, so the plugin
        // is removed rather than left to talk over it.
        plugins={(defaults) => defaults.filter((plugin) => plugin !== Accessibility)}
        onDragStart={({ operation }) => {
          const workoutId = String(operation.source?.id ?? "");
          setDragging(workoutId);
          const from = candidates.find((candidate) => candidate.id === workoutId);
          if (from) {
            setAnnouncement(announceDragStart(from.title, from.planned_date));
          }
        }}
        onDragOver={({ operation }) => {
          const workoutId = String(operation.source?.id ?? "");
          const toDate = operation.target?.id;
          setAnnouncement(
            typeof toDate === "string"
              ? announceDragOver(toDate, check(workoutId, toDate))
              : announceDragOverNothing(),
          );
        }}
        onDragEnd={({ operation, canceled }) => {
          const workoutId = String(operation.source?.id ?? "");
          const toDate = operation.target?.id;
          setDragging(null);

          if (canceled || typeof toDate !== "string") {
            setAnnouncement(announceDragCancel(titleOf(workoutId)));
            return;
          }

          setAnnouncement(
            announceDrop(titleOf(workoutId), toDate, check(workoutId, toDate)),
          );
          request(workoutId, toDate);
        }}
      >
        <div className="flex flex-col gap-stack-md">
          {optimistic.view === "week" ? <WeekView week={optimistic} /> : null}
          {optimistic.view === "month" ? <MonthView month={optimistic} /> : null}
          {optimistic.view === "day" ? <DayView day={optimistic} /> : null}

          {/*
            The running commentary of a drag, which must stay polite. The
            toast below has its own region, because a refused move has to be
            heard over whatever else is being read.
          */}
          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>

          <UndoToast
            state={feedback}
            onUndo={undo}
            onHold={(held) => send({ type: "hold", hold: held, now: Date.now() })}
            onRelease={(held) =>
              send({ type: "release", hold: held, now: Date.now() })
            }
            onDismiss={() => send({ type: "dismiss" })}
          />
        </div>

        {pending === null ? null : (
          <MoveDialog
            warnings={pending.warnings}
            onCancel={() => setPending(null)}
            onConfirm={() => {
              // Every warning the athlete was shown goes back by name. The
              // server accepts only codes it raised itself, so this cannot
              // silence a rule it did not ask about.
              commit(
                pending.workoutId,
                pending.toDate,
                pending.warnings.map((warning) => warning.code),
              );
              setPending(null);
            }}
          />
        )}

        {pickingFrom === undefined ? null : (
          <MovePicker
            title={pickingFrom.title}
            fromDate={pickingFrom.planned_date}
            check={(toDate) => check(pickingFrom.id, toDate)}
            onCancel={() => setPicking(null)}
            onPick={(toDate) => {
              setPicking(null);
              request(pickingFrom.id, toDate);
            }}
          />
        )}
      </DragDropProvider>
    </MoveContext.Provider>
  );
}
