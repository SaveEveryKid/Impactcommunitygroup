"use server";

import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/env";
import { safeRedirectPath } from "@/lib/utils";
import {
  type ActionState,
  echoValues,
  emailOnlySchema,
  fieldErrorsFrom,
  newPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation";

const NOT_CONFIGURED: ActionState = {
  ok: false,
  message: "Accounts aren't available yet because the database isn't connected. Please try again later.",
};

export async function signUp(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error), values: echoValues(fd) };
  const supabase = await getSupabase();
  if (!supabase) return NOT_CONFIGURED;

  const next = parsed.data.account_type === "organization" ? "/dashboard/organizations/new" : "/dashboard";
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/confirm?next=${encodeURIComponent(next)}`,
      data: { display_name: parsed.data.display_name, is_adult: parsed.data.age_confirmation === "adult", account_type: parsed.data.account_type },
    },
  });
  if (error) {
    // Avoid account enumeration: generic message for "already registered".
    if (/registered|exists/i.test(error.message)) {
      redirect(`/check-email?email=${encodeURIComponent(parsed.data.email)}`);
    }
    return { ok: false, message: humanAuthError(error.message), values: echoValues(fd) };
  }
  redirect(`/check-email?email=${encodeURIComponent(parsed.data.email)}`);
}

export async function signIn(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error), values: echoValues(fd) };
  const supabase = await getSupabase();
  if (!supabase) return NOT_CONFIGURED;
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (/confirm/i.test(error.message)) {
      return { ok: false, message: "Confirm your email first. We sent a link when you signed up.", values: echoValues(fd) };
    }
    return { ok: false, message: "That email and password don't match an account.", values: echoValues(fd) };
  }
  redirect(safeRedirectPath(fd.get("next") as string | null));
}

export async function signOut() {
  const supabase = await getSupabase();
  await supabase?.auth.signOut();
  redirect("/");
}

export async function requestPasswordReset(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = emailOnlySchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error), values: echoValues(fd) };
  const supabase = await getSupabase();
  if (!supabase) return NOT_CONFIGURED;
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/auth/confirm?next=/reset-password`,
  });
  // Same response whether or not the account exists.
  return { ok: true, message: "If an account exists for that email, a reset link is on its way. It expires in one hour." };
}

export async function updatePassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = newPasswordSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const supabase = await getSupabase();
  if (!supabase) return NOT_CONFIGURED;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, message: "Your reset link has expired. Request a new one." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, message: humanAuthError(error.message) };
  redirect("/dashboard?notice=password-updated");
}

export async function resendConfirmation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = emailOnlySchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const supabase = await getSupabase();
  if (!supabase) return NOT_CONFIGURED;
  await supabase.auth.resend({ type: "signup", email: parsed.data.email, options: { emailRedirectTo: `${siteUrl}/auth/confirm` } });
  return { ok: true, message: "If that account is waiting for confirmation, we've sent a new link." };
}

function humanAuthError(msg: string): string {
  if (/rate limit|too many/i.test(msg)) return "Too many attempts. Wait a few minutes and try again.";
  if (/weak|pwned|leaked/i.test(msg)) return "That password has appeared in a data breach. Choose a different one.";
  if (/password/i.test(msg)) return "That password doesn't meet the requirements.";
  return "Something went wrong on our side. Try again in a moment.";
}
