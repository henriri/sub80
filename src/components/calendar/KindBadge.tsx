import { KIND_META } from "@/lib/calendar";
import type { WorkoutKind } from "@/lib/plan";
import { KIND_CLASSES } from "./kind-classes";
import { joinClasses } from "./styles";

type KindBadgeProps = {
  kind: WorkoutKind;
  /** `short` is the one-or-two-letter marker for a month cell. */
  size?: "label" | "short";
};

const base = [
  "inline-flex shrink-0 items-center justify-center",
  "rounded-(--cal-marker-radius)",
  "font-(family-name:--cal-marker-font) text-(length:--cal-marker-font-size)",
].join(" ");

const sizes = {
  label: "px-inline-sm",
  // No horizontal padding: a month cell is about 45px wide on a phone, and the
  // minimum width already keeps a one-letter marker from looking squashed.
  short: "min-w-(--cal-marker-size) px-inline-xs",
} satisfies Record<NonNullable<KindBadgeProps["size"]>, string>;

/**
 * A workout kind as a coloured chip that always carries its name in text, so
 * the kind never depends on the colour alone. The short marker keeps the full
 * name for screen readers.
 */
export function KindBadge({ kind, size = "label" }: KindBadgeProps) {
  const meta = KIND_META[kind];

  return (
    <span className={joinClasses(base, sizes[size], KIND_CLASSES[kind])}>
      {size === "label" ? (
        meta.label
      ) : (
        <>
          <span aria-hidden="true">{meta.short}</span>
          <span className="sr-only">{meta.label}</span>
        </>
      )}
    </span>
  );
}
