"use client";

import { Button } from "@/components/Button";
import { statusActionLabel } from "@/lib/calendar";
import type { SessionActions } from "@/lib/plan";

type StatusActionsProps = {
  workoutId: string;
  /** What this session offers, decided by `sessionActions` and nothing else. */
  actions: SessionActions;
  /** The dispatch from the island's `useActionState`. */
  action: (formData: FormData) => void;
  pending: boolean;
};

/**
 * Mark the session skipped, or put it back to planned.
 *
 * There is no "Mark done". A session is completed if and only if a run is
 * linked to it, so the way to finish one is to log the run; `log_run` writes
 * the status in SQL and nothing here can.
 *
 * Which of the two is rendered comes from `sessionActions`, which is also what
 * the calendar and the drag layer read, so the three cannot disagree. Neither
 * button is ever the status the session already has, so pressing one can never
 * produce the "already" refusal.
 *
 * One form per button rather than one form with several submit values: each
 * carries its own `action` as a hidden field, so a stray submit cannot mean a
 * status change the athlete did not press.
 */
export function StatusActions({
  workoutId,
  actions,
  action,
  pending,
}: StatusActionsProps) {
  const offered = [
    ...(actions.canSkip ? (["skipped"] as const) : []),
    ...(actions.canBackToPlanned ? (["planned"] as const) : []),
  ];

  return (
    <div className="flex flex-wrap gap-inline-sm">
      {offered.map((statusAction) => (
        <form key={statusAction} action={action}>
          <input type="hidden" name="workoutId" value={workoutId} />
          <input type="hidden" name="action" value={statusAction} />
          <Button type="submit" disabled={pending}>
            {statusActionLabel(statusAction)}
          </Button>
        </form>
      ))}
    </div>
  );
}
