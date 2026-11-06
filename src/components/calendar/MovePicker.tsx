"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useState } from "react";
import {
  addMonths,
  dropState,
  formatFullDate,
  formatMonthTitle,
  formatWeekdayShort,
  monthGrid,
  rejectMessage,
} from "@/lib/calendar";
import type { MoveCheck, Ymd } from "@/lib/plan";
import {
  dialog,
  dialogAction,
  dialogActionQuiet,
  dialogPanel,
  scrim,
} from "./dialog-styles";
import { focusRing, joinClasses } from "./styles";

type MovePickerProps = {
  title: string;
  /** The day the session is on now: where the picker opens, and the month. */
  fromDate: Ymd;
  /** The same `validateMove` the drag uses, so both routes agree. */
  check: (toDate: Ymd) => MoveCheck;
  onPick: (toDate: Ymd) => void;
  onCancel: () => void;
};

const grid = "grid grid-cols-7 gap-(--cal-grid-gap)";

const dayButton = [
  "flex min-h-touch items-center justify-center",
  "rounded-(--cal-cell-radius) text-small",
  focusRing,
].join(" ");

/** One string per state: two arbitrary values of one property would race. */
function dayClasses(check: MoveCheck, inMonth: boolean, isCurrent: boolean) {
  if (!check.ok) {
    return "bg-(--cal-drop-invalid-bg) text-(color:--cal-drop-invalid-fg)";
  }
  if (isCurrent) {
    return "bg-(--cal-today-bg) text-(color:--cal-date-fg) font-strong";
  }
  if (dropState(check) === "warning") {
    return "bg-(--cal-drop-valid-bg) text-(color:--cal-drop-valid-fg)";
  }
  return inMonth
    ? "bg-(--cal-cell-bg) text-(color:--cal-date-fg) hover:bg-raised"
    : "bg-(--cal-cell-bg-muted) text-(color:--cal-date-fg-muted) hover:bg-raised";
}

/**
 * The route that needs no dragging: a month of days, each either choosable or
 * visibly refused with its reason.
 *
 * A grid of buttons rather than `input type="date"`, which brings the
 * platform's own calendar and with it no way to mark a day as over the 60 km
 * ceiling. A day that cannot take the session is disabled, carries the reason
 * in its accessible name, and shows a word as well as a tint -- the same rule
 * the drop hints follow.
 *
 * It reaches beyond the loaded window on purpose, so any day in the plan can
 * be chosen. Out there `check` has no rows to judge by, so a clean answer
 * here can still come back from the server as something to confirm.
 */
export function MovePicker({
  title,
  fromDate,
  check,
  onPick,
  onCancel,
}: MovePickerProps) {
  const [month, setMonth] = useState<Ymd>(fromDate);
  const weeks = monthGrid(month);
  const headings = weeks[0] ?? [];

  return (
    <AlertDialog.Root open onOpenChange={(open) => (open ? undefined : onCancel())}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={scrim} style={{ inset: 0 }} />
        <AlertDialog.Content className={joinClasses(dialog, dialogPanel)}>
          <AlertDialog.Title className="text-heading-sm">
            Move {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="text-small text-secondary">
            It is on {formatFullDate(fromDate)}. Choose another day.
          </AlertDialog.Description>

          <div className="flex items-center justify-between gap-inline-sm">
            <button
              type="button"
              onClick={() => setMonth(addMonths(month, -1))}
              className={joinClasses(dayButton, dialogActionQuiet, "min-w-touch")}
            >
              <span aria-hidden="true">←</span>
              <span className="sr-only">Previous month</span>
            </button>
            <p aria-live="polite" className="font-strong text-small">
              {formatMonthTitle(month)}
            </p>
            <button
              type="button"
              onClick={() => setMonth(addMonths(month, 1))}
              className={joinClasses(dayButton, dialogActionQuiet, "min-w-touch")}
            >
              <span aria-hidden="true">→</span>
              <span className="sr-only">Next month</span>
            </button>
          </div>

          <div aria-hidden="true" className={grid}>
            {headings.map((cell) => (
              <span
                key={cell.date}
                className="text-center text-small text-(color:--cal-weekday-fg)"
              >
                {formatWeekdayShort(cell.date)}
              </span>
            ))}
          </div>

          <div className={grid}>
            {weeks.flat().map((cell) => {
              const outcome = check(cell.date);
              const isCurrent = cell.date === fromDate;
              const reason = outcome.ok ? null : rejectMessage(outcome.reason);

              return (
                <button
                  key={cell.date}
                  type="button"
                  disabled={!outcome.ok}
                  onClick={() => onPick(cell.date)}
                  aria-label={
                    reason === null
                      ? formatFullDate(cell.date)
                      : `${formatFullDate(cell.date)}. ${reason}`
                  }
                  className={joinClasses(
                    dayButton,
                    dayClasses(outcome, cell.inMonth, isCurrent),
                  )}
                  title={reason ?? undefined}
                >
                  {/*
                    The day number stays, so the grid is still a calendar. The
                    cross is what says "not this one" without relying on the
                    tint; the whole reason is in the accessible name and in
                    the tooltip.
                  */}
                  <span aria-hidden="true">
                    {cell.dayOfMonth}
                    {outcome.ok ? null : " ×"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap justify-end gap-inline-sm">
            <AlertDialog.Cancel
              className={joinClasses(dialogAction, dialogActionQuiet)}
            >
              Cancel
            </AlertDialog.Cancel>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
