import type { ComponentPropsWithoutRef } from "react";

type TextAreaProps = Omit<ComponentPropsWithoutRef<"textarea">, "id"> & {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  /**
   * An extra element describing the field, such as a live character count the
   * form owns. Appended to the hint and error, rather than replacing them.
   */
  describedBy?: string;
};

/**
 * A multi-line field, built like `TextField` and sharing its tokens.
 *
 * `maxLength` is deliberately not set by default. A hard stop mid-word with no
 * explanation is worse than a count going negative and the submit refusing,
 * and the server is what actually decides either way.
 */
const field = [
  "min-h-(--field-min-height) w-full px-(--field-padding-x) py-(--field-padding-y)",
  "rounded-(--field-radius) bg-(--field-bg) text-(color:--field-fg)",
  "border-(length:--border-width-default) border-(--field-border)",
  "font-(family-name:--field-font-family) text-body",
  "aria-invalid:border-(--field-border-error)",
  "focus-visible:outline-(length:--border-width-focus) focus-visible:outline-offset-(--space-focus-offset) focus-visible:outline-focus",
  "disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");

export function TextArea({
  id,
  label,
  hint,
  error,
  describedBy,
  className,
  ...props
}: TextAreaProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describers =
    [hintId, errorId, describedBy].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-stack-sm">
      <label htmlFor={id} className="font-strong text-body">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-small text-secondary">
          {hint}
        </p>
      ) : null}
      <textarea
        id={id}
        className={className ? `${field} ${className}` : field}
        aria-invalid={error ? true : undefined}
        aria-describedby={describers}
        {...props}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
