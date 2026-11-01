import type { ComponentPropsWithoutRef } from "react";

type ButtonProps = ComponentPropsWithoutRef<"button">;

const base = [
  "inline-flex items-center justify-center",
  "min-h-(--button-min-height) min-w-touch px-(--button-padding-x) py-(--button-padding-y)",
  "rounded-(--button-radius) bg-(--button-bg) text-(color:--button-fg)",
  "font-(family-name:--button-font-family) font-(--button-font-weight) text-body",
  "hover:bg-(--button-bg-hover)",
  "focus-visible:outline-(length:--border-width-focus) focus-visible:outline-offset-(--space-focus-offset) focus-visible:outline-focus",
  "disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");

export function Button({ className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={className ? `${base} ${className}` : base}
      {...props}
    />
  );
}
