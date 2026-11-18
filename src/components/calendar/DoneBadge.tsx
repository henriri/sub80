import { joinClasses } from "./styles";

type DoneBadgeProps = {
  /** `short` is the one-glyph marker a month cell has room for. */
  size?: "label" | "short";
  /**
   * The kind the marker replaces, for the accessible name.
   *
   * In a month cell the done marker takes the kind marker's place -- there is
   * no room for both at seven columns on a phone -- so the kind has to be said
   * here instead of being silently dropped.
   */
  kindLabel?: string;
};

/**
 * A session that happened.
 *
 * Filled, where a planned marker is a pale tint, and carrying a check: the cue
 * is never the colour on its own, which is also why the word DONE is spelled
 * out at label size and why `describeDay` says "done" in a day cell's
 * accessible name.
 */
const base = [
  "inline-flex shrink-0 items-center justify-center gap-inline-xs",
  "rounded-(--cal-marker-radius)",
  "bg-(--cal-done-badge-bg) text-(color:--cal-done-badge-fg)",
  "font-(family-name:--cal-marker-font) text-(length:--cal-marker-font-size)",
].join(" ");

const sizes = {
  label: "px-inline-sm font-strong",
  // No horizontal padding, exactly as the kind marker has none: a month cell is
  // about 45px wide on a phone and the minimum width is what keeps one glyph
  // from looking squashed.
  short: "min-w-(--cal-marker-size) px-inline-xs",
} satisfies Record<NonNullable<DoneBadgeProps["size"]>, string>;

export function DoneBadge({ size = "label", kindLabel }: DoneBadgeProps) {
  const spoken = kindLabel === undefined ? "Done" : `${kindLabel}, done`;

  return (
    <span className={joinClasses(base, sizes[size])}>
      <span aria-hidden="true">✓</span>
      {size === "label" ? (
        <span aria-hidden="true">DONE</span>
      ) : null}
      <span className="sr-only">{spoken}</span>
    </span>
  );
}
