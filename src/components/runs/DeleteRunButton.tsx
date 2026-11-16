"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useActionState, useId, useState } from "react";
import {
  dialog,
  dialogAction,
  dialogActionQuiet,
  dialogActionStrong,
  dialogPanel,
  scrim,
} from "@/components/calendar/dialog-styles";
import { focusRing, joinClasses } from "@/components/calendar/styles";
import {
  resetCheckboxLabel,
  resetWithheldMessage,
  type ResetOffer,
} from "@/lib/runs";
import type { RunResult } from "@/app/runs/actions";
import { hasFocusRing } from "./styles";

export type RemoveAction = (
  previous: RunResult | null,
  formData: FormData,
) => Promise<RunResult>;

type DeleteRunButtonProps = {
  runId: string;
  /** Whether putting the session back is on the table, and why not if it is not. */
  offer: ResetOffer;
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

const checkboxRow = [
  "flex min-h-touch cursor-pointer items-center gap-inline-sm",
  "rounded-(--choice-radius) px-(--choice-padding-x) py-(--choice-padding-y)",
  "border-(length:--border-width-default) border-(--choice-border)",
  hasFocusRing,
].join(" ");

/**
 * Deleting a run, behind a confirmation.
 *
 * The dialog carries the one decision that comes with the deletion: whether
 * the session the run was logged against goes back to planned. The checkbox
 * only appears when ticking it would actually do something -- `delete_run`
 * refuses a reset it cannot honour, so `resetOffer` is what decides, and the
 * one case the athlete might have expected gets a sentence instead.
 *
 * Ticked by default when it is offered: deleting a run almost always means the
 * session did not happen after all, and leaving it marked completed with
 * nothing behind it is a state the athlete would have to go and find.
 *
 * Cancel takes the initial focus, so return on a dialog nobody has read keeps
 * the run.
 */
export function DeleteRunButton({ runId, offer, action }: DeleteRunButtonProps) {
  const [result, dispatch, pending] = useActionState(action, null);
  const [open, setOpen] = useState(false);
  const id = useId();

  const withheldNote = offer.offered
    ? null
    : resetWithheldMessage(
        offer.withheld,
        // Only 'other_runs' says anything, and it reads without a title too.
        null,
      );

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
              This cannot be undone. A run is a fact, not a plan change, so
              there is no undo for it.
            </AlertDialog.Description>

            {/*
              Inside the form, so the checkbox is submitted with the deletion.
              A checkbox sends nothing at all when it is not ticked, which is
              exactly what the action reads it as.
            */}
            <form action={dispatch} className="flex flex-col gap-stack-md">
              <input type="hidden" name="runId" value={runId} />

              {offer.offered ? (
                <label htmlFor={id} className={checkboxRow}>
                  <input
                    id={id}
                    type="checkbox"
                    name="resetWorkout"
                    value="on"
                    defaultChecked
                    className="size-(--space-4)"
                  />
                  <span className="text-body">
                    {resetCheckboxLabel(offer.workoutTitle)}
                  </span>
                </label>
              ) : null}

              {withheldNote ? (
                <p className="text-small text-secondary">{withheldNote}</p>
              ) : null}

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
