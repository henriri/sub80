type BigNumberProps = {
  /** 'The big picture': what this number is an answer to. */
  eyebrow: string;
  value: number;
  /** 'km'. Beside the number, not inside it, so the number stays a number. */
  unit: string;
  /** 'of 940 km planned'. */
  caption: string;
};

/**
 * One measurement, large, with the line that gives it a scale.
 *
 * Deliberately not a card: it is the answer to the heading above it, and a
 * border round it would make it a third panel competing with the two below.
 *
 * No heading of its own either. The eyebrow is a label for the number rather
 * than a section title, so it is read as part of the figure -- which is what
 * the `<p>` wrapping all three parts gives a screen reader, in one go, instead
 * of three unrelated fragments.
 */
export function BigNumber({ eyebrow, value, unit, caption }: BigNumberProps) {
  return (
    <p className="flex flex-col">
      <span className="text-small text-secondary">{eyebrow}</span>
      <span className="flex items-baseline gap-inline-xs">
        <span className="font-heading text-heading-lg">{value}</span>
        <span className="text-body text-secondary">{unit}</span>
      </span>
      <span className="text-small text-secondary">{caption}</span>
    </p>
  );
}
