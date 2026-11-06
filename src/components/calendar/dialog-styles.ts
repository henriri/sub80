/** Class strings the two dialogs share. Token utilities only, no literals. */

import { focusRing } from "./styles";

/**
 * The scrim. `inset` is set in a style prop rather than with `inset-0`,
 * because globals.css clears Tailwind's spacing scale and the lint rule
 * allows a literal zero for exactly this.
 */
export const scrim = "fixed z-20 bg-(--cal-dialog-scrim)";

/** Centred, as wide as it is allowed to be, never wider than the viewport. */
export const dialog = [
  "fixed top-1/2 left-1/2 z-30 -translate-x-1/2 -translate-y-1/2",
  "w-(--cal-dialog-width) max-w-full",
].join(" ");

export const dialogPanel = [
  "flex flex-col gap-stack-md rounded-surface bg-surface p-inset-md",
  "border-(length:--border-width-default) border-default",
  "shadow-(--cal-dialog-shadow)",
].join(" ");

/** A dialog button: a real touch target, in the button's own tokens. */
export const dialogAction = [
  "inline-flex min-h-touch items-center justify-center",
  "rounded-(--button-radius) px-(--button-padding-x) py-(--button-padding-y)",
  "font-(family-name:--button-font-family) font-(--button-font-weight)",
  focusRing,
].join(" ");

export const dialogActionQuiet = [
  "border-(length:--border-width-default) border-default hover:bg-raised",
].join(" ");

export const dialogActionStrong = [
  "bg-(--button-bg) text-(color:--button-fg) hover:bg-(--button-bg-hover)",
].join(" ");
