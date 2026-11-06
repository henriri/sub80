"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { warningMessage, warningTitle } from "@/lib/calendar";
import type { MoveWarning } from "@/lib/plan";
import {
  dialog,
  dialogAction,
  dialogActionQuiet,
  dialogActionStrong,
  dialogPanel,
  scrim,
} from "./dialog-styles";
import { joinClasses } from "./styles";

type MoveDialogProps = {
  /** Every warning that applies. Several can at once; all of them are shown. */
  warnings: readonly MoveWarning[];
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * The question a warned move has to answer first.
 *
 * Every warning is listed rather than summarised: a day can be both a double
 * day and next to a key session, and the athlete is the one deciding, so
 * hiding one of two reasons would be deciding for them. Confirming sends each
 * warning's code as an override, and those codes are what the event's payload
 * records.
 *
 * Cancel takes the initial focus, so return on a dialog nobody has read puts
 * the session back rather than committing the move.
 */
export function MoveDialog({ warnings, onConfirm, onCancel }: MoveDialogProps) {
  return (
    <AlertDialog.Root open onOpenChange={(open) => (open ? undefined : onCancel())}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={scrim} style={{ inset: 0 }} />
        <AlertDialog.Content className={joinClasses(dialog, dialogPanel)}>
          <AlertDialog.Title className="text-heading-sm">
            {warningTitle(warnings)}
          </AlertDialog.Title>

          <AlertDialog.Description asChild>
            <ul className="flex flex-col gap-stack-sm text-small text-secondary">
              {/*
                Keyed by more than the code: a key session can sit on both the
                day before and the day after, so `consecutive_key` can appear
                twice in one list.
              */}
              {warnings.map((warning) => (
                <li
                  key={
                    warning.code === "consecutive_key"
                      ? `${warning.code}-${warning.side}`
                      : warning.code
                  }
                >
                  {warningMessage(warning)}
                </li>
              ))}
            </ul>
          </AlertDialog.Description>

          <div className="flex flex-wrap justify-end gap-inline-sm">
            <AlertDialog.Cancel
              className={joinClasses(dialogAction, dialogActionQuiet)}
            >
              Keep it where it is
            </AlertDialog.Cancel>
            <AlertDialog.Action
              onClick={onConfirm}
              className={joinClasses(dialogAction, dialogActionStrong)}
            >
              Move it anyway
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
