"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import {
  dialog,
  dialogAction,
  dialogActionQuiet,
  dialogActionStrong,
  dialogPanel,
  scrim,
} from "@/components/calendar/dialog-styles";
import { joinClasses } from "@/components/calendar/styles";
import { runWarningMessage, runWarningTitle, type RunWarning } from "@/lib/runs";

type RunWarningDialogProps = {
  /** Every warning that still needs confirming. Several can apply at once. */
  warnings: readonly RunWarning[];
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * The question an odd-looking run has to answer before it is saved.
 *
 * Every warning is listed rather than summarised: a run can be both unusually
 * slow and the second one on its session, and the athlete is the one deciding,
 * so hiding one of two reasons would be deciding for them. Confirming sends
 * each warning's code back with the form, and the Server Action re-runs the
 * same rules and refuses any warning it did not get a code for.
 *
 * Cancel takes the initial focus, so return on a dialog nobody has read goes
 * back to the form rather than saving.
 */
export function RunWarningDialog({
  warnings,
  onConfirm,
  onCancel,
}: RunWarningDialogProps) {
  return (
    <AlertDialog.Root open onOpenChange={(open) => (open ? undefined : onCancel())}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={scrim} style={{ inset: 0 }} />
        <AlertDialog.Content className={joinClasses(dialog, dialogPanel)}>
          <AlertDialog.Title className="text-heading-sm">
            {runWarningTitle(warnings)}
          </AlertDialog.Title>

          <AlertDialog.Description asChild>
            <ul className="flex flex-col gap-stack-sm text-small text-secondary">
              {warnings.map((warning) => (
                <li key={warning.code}>{runWarningMessage(warning)}</li>
              ))}
            </ul>
          </AlertDialog.Description>

          <div className="flex flex-wrap justify-end gap-inline-sm">
            <AlertDialog.Cancel className={joinClasses(dialogAction, dialogActionQuiet)}>
              Go back and check
            </AlertDialog.Cancel>
            <AlertDialog.Action
              onClick={onConfirm}
              className={joinClasses(dialogAction, dialogActionStrong)}
            >
              Save it anyway
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
