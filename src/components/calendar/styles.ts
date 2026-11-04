/** Class strings the calendar shares. Token utilities only, no literals. */

/** The outline every focusable thing in the calendar gets. */
export const focusRing = [
  "focus-visible:outline-(length:--border-width-focus)",
  "focus-visible:outline-offset-(--space-focus-offset)",
  "focus-visible:outline-focus",
].join(" ");

/** A bordered panel on the canvas. */
export const panel = [
  "rounded-surface bg-surface p-inset-md",
  "border-(length:--border-width-default) border-default",
].join(" ");

/** A header or navigation link: a real touch target, not just text. */
export const navLink = [
  "inline-flex items-center justify-center",
  "min-h-(--cal-nav-min-size) min-w-touch px-inline-sm",
  "rounded-control border-(length:--border-width-default) border-default",
  "text-small text-primary hover:bg-raised",
  focusRing,
].join(" ");

/** The view the calendar is already showing. */
export const navLinkCurrent = "bg-accent text-on-accent hover:bg-accent-hover";

export const joinClasses = (...parts: (string | false | undefined)[]) =>
  parts.filter(Boolean).join(" ");
