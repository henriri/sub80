import { dropHint, dropState, type DropState } from "@/lib/calendar";
import type { MoveCheck } from "@/lib/plan";
import { joinClasses } from "./styles";

type DropHintProps = {
  check: MoveCheck;
  /** `cell` fits a month square; `column` has room for a week column. */
  size?: "cell" | "column";
};

/**
 * What a day says about the session being dragged over it.
 *
 * Always a glyph and a word, never a colour on its own: a tick and a cross
 * are not distinguishable to everyone either, and "Full" or "60 km" says
 * something a red tint cannot.
 */
const GLYPH: Record<DropState, string> = {
  valid: "↓",
  warning: "?",
  invalid: "×",
};

const base = [
  "inline-flex items-center gap-inline-xs",
  "rounded-control px-inline-xs text-small font-strong",
].join(" ");

/** One string per state: two arbitrary values of one property would race. */
function stateClasses(state: DropState) {
  return state === "invalid"
    ? "bg-(--cal-drop-invalid-bg) text-(color:--cal-drop-invalid-fg)"
    : "bg-(--cal-drop-valid-bg) text-(color:--cal-drop-valid-fg)";
}

export function DropHint({ check, size = "column" }: DropHintProps) {
  const state = dropState(check);

  return (
    <span
      // The sentence is in the board's live region, so a screen reader hears
      // the whole reason rather than this one word twice.
      aria-hidden="true"
      className={joinClasses(base, stateClasses(state))}
    >
      <span>{GLYPH[state]}</span>
      {size === "column" ? <span>{dropHint(check)}</span> : null}
    </span>
  );
}

/** The outline a day cell takes while a session hovers over it. */
export function dropSurfaceClasses(state: DropState, isTarget: boolean) {
  const colours =
    state === "invalid"
      ? "bg-(--cal-drop-invalid-bg) border-(--cal-drop-invalid-border)"
      : "bg-(--cal-drop-valid-bg) border-(--cal-drop-valid-border)";

  // Two widths rather than two colours: the day under the session has to be
  // distinguishable from the other six that would also accept it.
  return isTarget
    ? `${colours} border-(length:--cal-today-ring-width)`
    : `${colours} border-(length:--border-width-default)`;
}
