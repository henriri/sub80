/** Class strings the run screens share. Token utilities only, no literals. */

/**
 * The focus outline for a control whose INPUT is visually hidden and whose
 * label carries the appearance, so the ring has to come from `has-*`.
 *
 * Written out rather than derived from `focusRing` with a string replace:
 * Tailwind generates utilities by scanning source text, so a class name
 * assembled at run time is a class name that never gets generated.
 */
export const hasFocusRing = [
  "has-focus-visible:outline-(length:--border-width-focus)",
  "has-focus-visible:outline-offset-(--space-focus-offset)",
  "has-focus-visible:outline-focus",
].join(" ");

/** A tappable option whose label carries the appearance. */
export const choiceSurface = [
  "rounded-(--choice-radius) bg-(--choice-bg) text-(color:--choice-fg)",
  "border-(length:--border-width-default) border-(--choice-border)",
  "hover:bg-(--choice-bg-hover)",
  "has-checked:bg-(--choice-bg-selected) has-checked:text-(color:--choice-fg-selected)",
  hasFocusRing,
].join(" ");

/** One row of the run list, and the panel a run's facts sit in. */
export const runPanel = [
  "flex flex-col gap-stack-sm rounded-surface bg-surface p-inset-md",
  "border-(length:--border-width-default) border-default",
].join(" ");
