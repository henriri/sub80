import type { ComponentPropsWithoutRef } from "react";

type TextFieldProps = Omit<ComponentPropsWithoutRef<"input">, "id"> & {
  id: string;
  label: string;
  hint?: string;
  error?: string;
};

const input = [
  "min-h-(--field-min-height) w-full px-(--field-padding-x) py-(--field-padding-y)",
  "rounded-(--field-radius) bg-(--field-bg) text-(color:--field-fg)",
  "border-(length:--border-width-default) border-(--field-border)",
  "font-(family-name:--field-font-family) text-body",
  "aria-invalid:border-(--field-border-error)",
  "focus-visible:outline-(length:--border-width-focus) focus-visible:outline-offset-(--space-focus-offset) focus-visible:outline-focus",
  "disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");

export function TextField({
  id,
  label,
  hint,
  error,
  className,
  ...props
}: TextFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

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
      <input
        id={id}
        className={className ? `${input} ${className}` : input}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
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
