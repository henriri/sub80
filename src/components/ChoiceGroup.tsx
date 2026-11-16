import type { ReactNode } from "react";

export type Choice = {
  value: string;
  /** What is shown in the segment. Keep it short: a number, or one word. */
  label: string;
  /**
   * The full name a screen reader should read, when the visible label is a
   * shorthand. '4, moderate' for a segment showing only '4'.
   */
  spokenLabel?: string;
};

type ChoiceGroupProps = {
  /** The form field name every option shares. */
  name: string;
  /** The question, as the fieldset's legend. */
  legend: string;
  options: readonly Choice[];
  /** The option selected on first render, if any. */
  defaultValue?: string | null;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** Called with the chosen value. Only in a client component. */
  onChange?: (value: string) => void;
  /** The controlled value, when a parent tracks it. */
  value?: string | null;
};

/**
 * One choice out of several, as native radio inputs in a fieldset.
 *
 * Native radios rather than a Radix radio group, deliberately: the arrow keys,
 * the roving tab stop, the grouping and the label association all come from the
 * browser, it needs no JavaScript to submit inside a form, and it adds no
 * dependency. The styling is the `has-checked:` pattern the /design mode
 * switcher already uses -- the input is visually hidden but still focusable,
 * and the label it sits inside carries the appearance.
 *
 * Every segment is at least 44px in both directions.
 */
const segment = [
  "inline-flex cursor-pointer items-center justify-center",
  "min-h-(--choice-min-size) min-w-(--choice-min-size)",
  "px-(--choice-padding-x) py-(--choice-padding-y)",
  "rounded-(--choice-radius) bg-(--choice-bg) text-(color:--choice-fg)",
  "border-(length:--border-width-default) border-(--choice-border)",
  "font-(family-name:--choice-font-family) text-body",
  "hover:bg-(--choice-bg-hover)",
  "has-checked:bg-(--choice-bg-selected) has-checked:text-(color:--choice-fg-selected)",
  "has-focus-visible:outline-(length:--border-width-focus) has-focus-visible:outline-offset-(--space-focus-offset) has-focus-visible:outline-focus",
  "has-disabled:cursor-not-allowed has-disabled:opacity-50",
].join(" ");

export function ChoiceGroup({
  name,
  legend,
  options,
  defaultValue,
  hint,
  error,
  required,
  disabled,
  onChange,
  value,
}: ChoiceGroupProps) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  // Controlled only when a value is passed; otherwise the browser owns it and
  // the field still works with no JavaScript at all.
  const controlled = value !== undefined;

  return (
    <fieldset aria-describedby={describedBy} aria-invalid={error ? true : undefined}>
      <legend className="font-strong text-body">{legend}</legend>

      {hint ? (
        <p id={hintId} className="mt-stack-sm text-small text-secondary">
          {hint}
        </p>
      ) : null}

      <div className="mt-stack-sm flex flex-wrap gap-(--choice-gap)">
        {options.map((option) => (
          <label key={option.value} className={segment}>
            <input
              type="radio"
              name={name}
              value={option.value}
              required={required}
              disabled={disabled}
              {...(controlled
                ? { checked: value === option.value }
                : { defaultChecked: defaultValue === option.value })}
              onChange={onChange ? () => onChange(option.value) : undefined}
              className="sr-only"
            />
            <span aria-hidden={option.spokenLabel ? true : undefined}>
              {option.label}
            </span>
            {option.spokenLabel ? (
              <span className="sr-only">{option.spokenLabel}</span>
            ) : null}
          </label>
        ))}
      </div>

      {error ? (
        <p id={errorId} role="alert" className="mt-stack-sm text-small text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
