"use client";

import { useEffect, useState } from "react";
import { isHeld, secondsLeft } from "@/lib/ui/countdown";
import { feedbackRole, undoOffered, type MoveFeedback } from "@/lib/ui/move-feedback";
import { dialogAction, dialogActionQuiet } from "./dialog-styles";
import { focusRing, joinClasses } from "./styles";

type CountdownHold = "hover" | "focus";

type UndoToastProps = {
  state: MoveFeedback;
  onUndo: (eventId: string) => void;
  onHold: (hold: CountdownHold) => void;
  onRelease: (hold: CountdownHold) => void;
  onDismiss: () => void;
};

const toast = [
  "flex flex-wrap items-center justify-between gap-inline-sm",
  "rounded-surface bg-surface p-inset-md",
  "border-(length:--border-width-default) border-default",
  "shadow-(--cal-dialog-shadow)",
].join(" ");

const close = [
  "inline-flex min-h-touch min-w-touch items-center justify-center",
  "rounded-control hover:bg-raised",
  focusRing,
].join(" ");

/**
 * A second hand, so the countdown redraws. Null until it has run once.
 *
 * All the arithmetic is in `src/lib/ui/countdown`; this only decides when to
 * ask it again. It keeps ticking while the countdown is held, because a held
 * countdown has to repaint the moment it is let go.
 *
 * The clock is read in the interval and never during render: a prerender has
 * no meaningful "now", and reading one there makes the build refuse the page.
 * Until the first tick, a quarter of a second later, the caller falls back to
 * the moment the countdown started -- so the toast paints with the whole
 * window, which is what it has.
 */
function useSecondHand(active: boolean) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [active]);

  return now;
}

/**
 * What the calendar says after a move, and the shortcut back.
 *
 * The countdown pauses on hover and on keyboard focus, so reading the sentence
 * or tabbing to the button never costs the time needed to use it. Holding is a
 * list of reasons rather than a flag: hover in, tab in, hover out has to stay
 * paused. A screen-reader user therefore has as long as they keep the button
 * focused, which is why the seconds need not be read out.
 *
 * `role="status"` sits on the sentence alone, not on the whole toast. A live
 * region containing a number that changes four times a second would talk over
 * everything else on the page; this way the sentence is announced once and the
 * clock ticks silently. The button keeps a steady name for the same reason.
 *
 * When the window runs out only the shortcut goes. The event is permanent and
 * "Recent changes" still offers it, which is what makes expiring acceptable.
 */
export function UndoToast({
  state,
  onUndo,
  onHold,
  onRelease,
  onDismiss,
}: UndoToastProps) {
  const counting = state.kind === "moved";
  const tick = useSecondHand(counting);

  if (state.kind === "idle") return null;

  const now =
    tick ?? (state.kind === "moved" ? (state.countdown.runningSince ?? 0) : 0);
  const offered = state.kind === "moved" && undoOffered(state, now);
  const seconds = state.kind === "moved" ? secondsLeft(state.countdown, now) : 0;
  const held = state.kind === "moved" && isHeld(state.countdown);

  return (
    <div
      onPointerEnter={() => onHold("hover")}
      onPointerLeave={() => onRelease("hover")}
      onFocus={() => onHold("focus")}
      onBlur={() => onRelease("focus")}
      className={toast}
    >
      <p
        role={feedbackRole(state) ?? undefined}
        className={joinClasses(
          "text-small",
          state.kind === "error" ? "text-danger" : "text-secondary",
        )}
      >
        {state.message}
      </p>

      <div className="flex flex-wrap items-center gap-inline-sm">
        {state.kind === "moved" && offered ? (
          <button
            type="button"
            onClick={() => onUndo(state.eventId)}
            className={joinClasses(dialogAction, dialogActionQuiet)}
          >
            Undo
            {/*
              The clock is for the eye only. It pauses while the button is
              focused, so a screen-reader user is never racing it.
            */}
            <span aria-hidden="true" className="font-code">
              {" "}
              {held ? "||" : seconds}
            </span>
          </button>
        ) : null}

        <button type="button" onClick={onDismiss} className={close}>
          <span aria-hidden="true">×</span>
          <span className="sr-only">Dismiss</span>
        </button>
      </div>
    </div>
  );
}
