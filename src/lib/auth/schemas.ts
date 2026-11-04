import { z } from "zod";

export const emailSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
});

// Matches otp_length in supabase/config.toml and the dashboard setting.
export const codeSchema = z.object({
  email: emailSchema.shape.email,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from the email."),
});
