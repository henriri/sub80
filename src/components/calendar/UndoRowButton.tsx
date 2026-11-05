"use client";

import { startTransition, useState } from "react";
import { undoLastMove } from "@/app/actions";
import { STALE_UNDO_MESSAGE } from "@/lib/calendar";
import type { UndoAction } from "./CalendarBoard";
import { dialogAction, dialogActionQuiet } from "./dialog-styles";
import { joinClasses } from "./styles";

type UndoRowButtonProps = {
  eventId: string;
  /** Overridable so /design can show the row without a session. */
  onUndo?: UndoAction;
};

/**
 * Undo for one row of "Recent changes".
 *
 * Its own small client component, so the list itself stays a server component
 * and reads the events without shipping them twice. The failure message is
 * the stale one, because the only way the database refuses an undo this
 * button offered is that the page's data has been overtaken.
 */
export function UndoRowButton({
  eventId,
  onUndo = undoLastMove,
}: UndoRowButtonProps) {
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await onUndo(eventId);
            if (result.status !== "ok") setError(STALE_UNDO_MESSAGE);
          })
        }
        className={joinClasses(dialogAction, dialogActionQuiet)}
      >
        Undo
      </button>
      {error === null ? null : (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      )}
    </>
  );
}
