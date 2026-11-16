"use client";

import { startTransition, useActionState, useEffect, useReducer, useRef } from "react";
import {
  editNotes,
  lightenWorkout,
  restoreDistance,
  setStatus,
  type ChangeResult,
} from "@/app/workouts/actions";
import type { UndoAction } from "@/components/calendar/CalendarBoard";
import { UndoToast } from "@/components/calendar/UndoToast";
import { panel } from "@/components/calendar/styles";
import { STALE_UNDO_MESSAGE } from "@/lib/calendar";
import type { WorkoutStatus } from "@/lib/plan";
import { changeFeedback, idle, unseenResult } from "@/lib/ui/change-feedback";
import { undoChange } from "@/app/actions";
import { LightenActions, type LightenOption } from "./LightenActions";
import { NotesForm } from "./NotesForm";
import { StatusActions } from "./StatusActions";

/** A form action, matching what `useActionState` wants. */
export type ChangeAction = (
  previous: ChangeResult | null,
  formData: FormData,
) => Promise<ChangeResult>;

export type WorkoutActionsProps = {
  workoutId: string;
  status: WorkoutStatus;
  notes: string | null;
  lighten: readonly LightenOption[];
  restoreToM: number | null;
  /** Why the lighter actions are withheld, or null when they are offered. */
  lightenWithheld: string | null;
  /** Overridable so /design can show all of this without a session. */
  actions?: {
    editNotes: ChangeAction;
    setStatus: ChangeAction;
    lightenWorkout: ChangeAction;
    restoreDistance: ChangeAction;
    undoChange: UndoAction;
  };
};

const section = "flex flex-col gap-stack-sm";

/**
 * Everything on the detail page that writes, and the one toast that answers
 * for all of it.
 *
 * Four forms, four action states, one countdown. The forms are real forms with
 * server actions, so the keyboard works and each submit is a request the server
 * decides; the island exists because a countdown needs a clock and because
 * four separate toasts would talk over each other.
 *
 * The toast is a single state machine rather than four: a refusal must take
 * away an Undo button that pointed at a different change, which is exactly
 * what `changeFeedback` makes impossible. Each result carries a token and the
 * tokens already shown are remembered, because every action state keeps its
 * last answer for as long as the page lives -- so "the newest" cannot be read
 * off their order.
 *
 * The clock is read in the handler and the effect, never during a render: a
 * prerender has no meaningful "now".
 */
export function WorkoutActions({
  workoutId,
  status,
  notes,
  lighten,
  restoreToM,
  lightenWithheld,
  actions,
}: WorkoutActionsProps) {
  const onNotes = actions?.editNotes ?? editNotes;
  const onStatus = actions?.setStatus ?? setStatus;
  const onLighten = actions?.lightenWorkout ?? lightenWorkout;
  const onRestore = actions?.restoreDistance ?? restoreDistance;
  const onUndo = actions?.undoChange ?? undoChange;

  const [notesResult, notesAction, notesPending] = useActionState(onNotes, null);
  const [statusResult, statusAction, statusPending] = useActionState(onStatus, null);
  const [lightenResult, lightenAction, lightenPending] = useActionState(
    onLighten,
    null,
  );
  const [restoreResult, restoreAction, restorePending] = useActionState(
    onRestore,
    null,
  );

  const [feedback, send] = useReducer(changeFeedback, idle);
  const seen = useRef<Set<string>>(new Set());

  // Picked inside the effect, not during the render: the set of tokens already
  // shown is state the render has no business reading.
  useEffect(() => {
    const fresh = unseenResult(
      [notesResult, statusResult, lightenResult, restoreResult],
      seen.current,
    );
    if (fresh === null) return;
    seen.current.add(fresh.token);

    if (fresh.status === "error") {
      send({ type: "error", message: fresh.message });
      return;
    }

    send({
      type: "changed",
      eventId: fresh.eventId,
      workoutId: fresh.workoutId,
      message: fresh.message,
      undoneMessage: fresh.undoneMessage,
      now: Date.now(),
    });
  }, [notesResult, statusResult, lightenResult, restoreResult]);

  const undo = (eventId: string) => {
    startTransition(async () => {
      const restored =
        feedback.kind === "changed"
          ? feedback.undoneMessage
          : "That change has been put back.";

      const result = await onUndo(eventId);
      if (result.status === "ok") {
        send({ type: "undone", message: restored });
        return;
      }
      // The only way the database refuses an undo this toast offered is that
      // something has changed since. Its own message names a row id, which is
      // no use to the athlete, so this says what to do instead.
      send({ type: "error", message: STALE_UNDO_MESSAGE });
    });
  };

  return (
    <div className="flex flex-col gap-stack-md">
      <section className={`${panel} ${section}`} aria-labelledby="workout-notes">
        <h2 id="workout-notes" className="text-heading-sm">
          Notes
        </h2>
        <NotesForm
          workoutId={workoutId}
          notes={notes}
          action={notesAction}
          pending={notesPending}
        />
      </section>

      <section className={`${panel} ${section}`} aria-labelledby="workout-status">
        <h2 id="workout-status" className="text-heading-sm">
          Status
        </h2>
        <StatusActions
          workoutId={workoutId}
          status={status}
          action={statusAction}
          pending={statusPending}
        />
      </section>

      <section className={`${panel} ${section}`} aria-labelledby="workout-lighter">
        <h2 id="workout-lighter" className="text-heading-sm">
          A lighter day
        </h2>
        <LightenActions
          workoutId={workoutId}
          options={lighten}
          restoreToM={restoreToM}
          withheld={lightenWithheld}
          lighten={lightenAction}
          restore={restoreAction}
          pending={lightenPending || restorePending}
        />
      </section>

      <UndoToast
        state={feedback}
        onUndo={undo}
        onHold={(hold) => send({ type: "hold", hold, now: Date.now() })}
        onRelease={(hold) => send({ type: "release", hold, now: Date.now() })}
        onDismiss={() => send({ type: "dismiss" })}
      />
    </div>
  );
}
