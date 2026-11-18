"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useActionState, useState } from "react";
import {
  dialog,
  dialogAction,
  dialogActionQuiet,
  dialogActionStrong,
  dialogPanel,
  scrim,
} from "@/components/calendar/dialog-styles";
import { focusRing, joinClasses } from "@/components/calendar/styles";
import { deleteRunConsequence } from "@/lib/runs";
import type { RunResult } from "@/app/runs/actions";

export type RemoveAction = (
  previous: RunResult | null,
  formData: FormData,
) => Promise<RunResult>;

type DeleteRunButtonProps = {
  runId: string;
  /**
   * Whether this deletion puts the session back to planned.
   *
   * For the sentence only. The Server Action asks `resetsLinkedSession` again
   * against freshly read facts and sends the flag itself, so nothing the
   * browser could tamper with decides what happens to a session.
   */
  resetsSession: boolean;
  action: RemoveAction;
};

const danger = [
  "inline-flex min-h-touch items-center justify-center",
  "rounded-(--button-radius) px-(--button-padding-x) py-(--button-padding-y)",
  "border-(length:--border-width-default) border-default",
  "font-(family-name:--button-font-family) font-(--button-font-weight) text-body",
  "text-danger hover:bg-raised",
  "disabled:cursor-not-allowed disabled:opacity-50",
  focusRing,
].join(" ");

/**
 * Deleting a run, behind a confirmation.
 *
 * There is no checkbox. A session is completed if and only if a run is linked
 * to it, so deleting the only run against a session MUST put that session back
 * to planned -- leaving it marked done with nothing behind it is the state the
 * rule exists to make impossible. That is not a decision to offer, so the
 * dialog states it and the deletion does it. A session another run still points
 * at keeps its status, because it is still done.
 *
 * Cancel takes the initial focus, so return on a dialog nobody has read keeps
 * the run.
 */
export function DeleteRunButton({
  runId,
  resetsSession,
  action,
}: DeleteRunButtonProps) {
  const [result, dispatch, pending] = useActionState(action, null);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-stack-sm">
      <AlertDialog.Root open={open} onOpenChange={setOpen}>
        <AlertDialog.Trigger className={danger} disabled={pending}>
          {pending ? "Deleting…" : "Delete this run"}
        </AlertDialog.Trigger>

        <AlertDialog.Portal>
          <AlertDialog.Overlay className={scrim} style={{ inset: 0 }} />
          <AlertDialog.Content className={joinClasses(dialog, dialogPanel)}>
            <AlertDialog.Title className="text-heading-sm">
              Delete this run?
            </AlertDialog.Title>

            <AlertDialog.Description className="text-small text-secondary">
              {deleteRunConsequence(resetsSession)}
            </AlertDialog.Description>

            <form action={dispatch} className="flex flex-col gap-stack-md">
              <input type="hidden" name="runId" value={runId} />

              <div className="flex flex-wrap justify-end gap-inline-sm">
                <AlertDialog.Cancel
                  className={joinClasses(dialogAction, dialogActionQuiet)}
                >
                  Keep it
                </AlertDialog.Cancel>
                <button
                  type="submit"
                  className={joinClasses(dialogAction, dialogActionStrong)}
                  disabled={pending}
                >
                  Delete run
                </button>
              </div>
            </form>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      {/*
        A successful deletion redirects, so the only thing that lands here is a
        refusal -- which is exactly when the athlete needs a sentence.
      */}
      {result?.status === "error" ? (
        <p role="alert" className="text-small text-danger">
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
