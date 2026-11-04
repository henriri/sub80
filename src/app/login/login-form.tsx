"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = { step: "email", email: "" };

const linkButton = [
  "min-h-touch self-start text-body text-accent underline",
  "focus-visible:outline-(length:--border-width-focus) focus-visible:outline-offset-(--space-focus-offset) focus-visible:outline-focus",
].join(" ");

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  if (state.step === "code") {
    return (
      <form action={formAction} className="flex flex-col gap-stack-md">
        <input type="hidden" name="email" value={state.email} />
        <TextField
          id="code"
          name="code"
          label="Code"
          hint={`We sent a 6-digit code to ${state.email}.`}
          error={state.error}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
        />
        <Button type="submit" name="intent" value="verify" disabled={pending}>
          Sign in
        </Button>
        <button type="submit" name="intent" value="send" formNoValidate className={linkButton}>
          Send a new code
        </button>
        <button type="submit" name="intent" value="reset" formNoValidate className={linkButton}>
          Use a different email
        </button>
      </form>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-stack-md">
      <TextField
        id="email"
        name="email"
        type="email"
        label="Email"
        error={state.error}
        defaultValue={state.email}
        autoComplete="email"
        required
        autoFocus
      />
      <Button type="submit" name="intent" value="send" disabled={pending}>
        Send code
      </Button>
    </form>
  );
}
