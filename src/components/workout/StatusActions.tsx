"use client";

import { Button } from "@/components/Button";
import { statusActionLabel } from "@/lib/calendar";
import { offeredStatusActions, type WorkoutStatus } from "@/lib/plan";

type StatusActionsProps = {
  workoutId: string;
  status: WorkoutStatus;
  /** The dispatch from the island's `useActionState`. */
  action: (formData: FormData) => void;
  pending: boolean;
};

/**
 * Mark the session done or skipped, or put it back to planned.
 *
 * Only the transitions `validateStatus` allows are rendered -- which means the
 * status the session already has is never a button -- so pressing one can
 * never produce the "already" refusal. `offeredStatusActions` derives that
 * from the same rule the Server Action re-runs, rather than from a second
 * list kept here.
 *
 * Marking done is the status and nothing else. Logging the run that actually
 * happened, with its distance and its heart rate, is a different thing and
 * comes with the run form.
 *
 * One form per button rather than one form with several submit values: each
 * carries its own `action` as a hidden field, so a stray submit cannot mean a
 * status change the athlete did not press.
 */
export function StatusActions({
  workoutId,
  status,
  action,
  pending,
}: StatusActionsProps) {
  return (
    <div className="flex flex-wrap gap-inline-sm">
      {offeredStatusActions(status).map((statusAction) => (
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
