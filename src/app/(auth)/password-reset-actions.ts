"use server";

import { z } from "zod";
import { readFormString } from "@/server/auth/validation";
import { consumeAuthAttempt } from "@/server/auth/rate-limit";
import { completePasswordReset, requestPasswordReset } from "@/server/auth/password-reset";

export type PasswordResetActionState = { error?: string; message?: string };

const requestSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
});

const resetSchema = z.object({
  token: z.string().regex(/^[\w-]{43}$/),
  password: z.string().min(12).max(128),
});

export async function requestPasswordResetAction(
  _previous: PasswordResetActionState,
  formData: FormData,
): Promise<PasswordResetActionState> {
  const parsed = requestSchema.safeParse({ email: readFormString(formData, "email") });
  if (!parsed.success) return { error: "Enter a valid email address." };

  try {
    if (!(await consumeAuthAttempt("password-reset", parsed.data.email))) {
      return { message: "If an account matches that email, reset instructions will be sent." };
    }
    await requestPasswordReset(parsed.data.email);
  } catch {
    return { message: "If an account matches that email, reset instructions will be sent." };
  }
  return { message: "If an account matches that email, reset instructions will be sent." };
}

export async function resetPasswordAction(
  _previous: PasswordResetActionState,
  formData: FormData,
): Promise<PasswordResetActionState> {
  const parsed = resetSchema.safeParse({
    token: readFormString(formData, "token"),
    password: readFormString(formData, "password"),
  });
  if (!parsed.success) return { error: "Use a valid reset link and a password of at least 12 characters." };

  try {
    const updated = await completePasswordReset(parsed.data.token, parsed.data.password);
    if (!updated) return { error: "This reset link is invalid or has expired. Request a new one." };
  } catch {
    return { error: "Password could not be changed. Please try again." };
  }
  return { message: "Password updated. You can now sign in with your new password." };
}
