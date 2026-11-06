import { planEventMessage, type PlanEventSummary } from "@/lib/calendar";
import type { UndoAction } from "./CalendarBoard";
import { UndoRowButton } from "./UndoRowButton";
import { joinClasses, panel } from "./styles";

/** What a row needs. Structural, so the server-only PlanEvent type stays there. */
export type RecentChange = PlanEventSummary & {
  id: string;
  /** Whether this is the row the database would accept an undo for. */
  undoable: boolean;
};

type RecentChangesProps = {
  changes: readonly RecentChange[];
  /** Only /design sets this: see `UndoRowButton`. */
  onUndo?: UndoAction;
};

/**
 * The last few plan changes, newest first, and the durable way back.
 *
 * The toast's Undo expires; events do not. This is what makes that
 * acceptable: ten minutes later the move is still here and can still be
 * reversed.
 *
 * Undo is a stack, so the button goes on the first row that is a move and is
 * not already undone -- not merely on the first row. That is the same rule
 * `undo_plan_event` applies, so the interface never offers what the database
 * will refuse.
 */
export function RecentChanges({ changes, onUndo }: RecentChangesProps) {
  if (changes.length === 0) return null;

  return (
    <section
      aria-labelledby="recent-changes"
      className={joinClasses(panel, "flex flex-col gap-stack-sm")}
    >
      <h2 id="recent-changes" className="text-heading-sm">
        Recent changes
      </h2>

      <ol className="flex flex-col gap-stack-sm">
        {changes.map((change) => (
          <li
            key={change.id}
            className="flex flex-wrap items-center justify-between gap-inline-sm text-small"
          >
            <span className={change.status === "undone" ? "text-secondary" : undefined}>
              {planEventMessage(change)}
            </span>
            {change.undoable ? (
              <UndoRowButton eventId={change.id} onUndo={onUndo} />
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
