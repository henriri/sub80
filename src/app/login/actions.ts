"use server";

import { redirect } from "next/navigation";
import { codeSchema, emailSchema } from "@/lib/auth/schemas";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  step: "email" | "code";
  email: string;
  error?: string;
};

const initialState: LoginState = { step: "email", email: "" };

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function sendCode(formData: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse({ email: field(formData, "email") });
  if (!parsed.success) {
    return {
      step: "email",
      email: field(formData, "email"),
      error: parsed.error.issues[0]?.message,
    };
  }

  const { email } = parsed.data;
  const supabase = await createClient();
  // Single-user app: never create accounts from the login form.
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });

  if (error) {
    return {
      step: "email",
      email,
      error:
        error.status === 429
          ? "Too many requests. Wait a minute, then try again."
          : "Could not send a code. Check the address and try again.",
    };
  }

  return { step: "code", email };
}

async function verifyCode(formData: FormData): Promise<LoginState> {
  const parsed = codeSchema.safeParse({
    email: field(formData, "email"),
    code: field(formData, "code"),
  });
  if (!parsed.success) {
    return {
      step: "code",
      email: field(formData, "email"),
      error: parsed.error.issues[0]?.message,
    };
  }

  const { email, code } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: "email",
  });

  if (error) {
    return {
      step: "code",
      email,
      error: "That code is wrong or has expired. Request a new one.",
    };
  }

  redirect("/");
}

/** One action for the whole form; the submit button's `intent` picks the step. */
export async function loginAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  switch (field(formData, "intent")) {
    case "send":
      return sendCode(formData);
    case "verify":
      return verifyCode(formData);
    default:
      return initialState;
  }
}
