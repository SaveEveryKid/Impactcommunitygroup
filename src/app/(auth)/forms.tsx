"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, FieldShell, FormMessage, TextField } from "@/components/ui/field";
import type { ActionState } from "@/lib/validation";
import { requestPasswordReset, resendConfirmation, signIn, signUp, updatePassword } from "./actions";
import { cn } from "@/lib/utils";

function PasswordInput({ label, name, error, hint, autoComplete }: { label: string; name: string; error?: string; hint?: string; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <FieldShell label={label} error={error} hint={hint} required>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <input
            id={id}
            name={name}
            type={show ? "text" : "password"}
            autoComplete={autoComplete}
            required
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className="h-12 w-full rounded-[10px] border border-line-strong bg-surface pl-3.5 pr-12 text-base focus:border-teal focus:outline-none focus:ring-3 focus:ring-teal/20 aria-[invalid=true]:border-danger"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-1 top-1 grid h-10 w-10 place-items-center rounded-[8px] text-ink-muted hover:text-ink"
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
          >
            {show ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      )}
    </FieldShell>
  );
}

export function SignInForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(signIn, {});
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {notice ? <FormMessage tone="info">{notice}</FormMessage> : null}
      {state.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      <input type="hidden" name="next" value={next ?? "/dashboard"} />
      <TextField label="Email" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state.values?.email} error={state.fieldErrors?.email} />
      <PasswordInput label="Password" name="password" autoComplete="current-password" error={state.fieldErrors?.password} />
      <div className="-mt-2 text-right">
        <Link href="/forgot-password" className="text-[0.95rem] font-semibold text-teal-strong underline-offset-2 hover:underline">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" size="lg" pending={pending}>
        Sign in
      </Button>
    </form>
  );
}

export function SignUpForm({ defaultType }: { defaultType: "individual" | "organization" }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(signUp, {});
  const [type, setType] = useState(state.values?.account_type ?? defaultType);
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      <fieldset>
        <legend className="mb-2 text-[0.95rem] font-semibold">I&apos;m joining as</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["individual", "An individual", "Volunteer, attend, give"],
              ["organization", "An organization", "Nonprofit, church, business"],
            ] as const
          ).map(([value, label, sub]) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer flex-col rounded-[12px] border p-3.5 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-teal/30",
                type === value ? "border-teal bg-teal-wash" : "border-line-strong bg-surface hover:border-ink",
              )}
            >
              <input type="radio" name="account_type" value={value} checked={type === value} onChange={() => setType(value)} className="sr-only" />
              <span className="font-semibold">{label}</span>
              <span className="text-sm text-ink-muted">{sub}</span>
            </label>
          ))}
        </div>
        {type === "organization" ? (
          <p className="mt-2 text-sm text-ink-muted">You&apos;ll create your personal login first, then register the organization. You&apos;ll be its owner.</p>
        ) : null}
      </fieldset>
      <TextField label="Your name" name="display_name" autoComplete="name" required defaultValue={state.values?.display_name} error={fe.display_name} />
      <TextField label="Email" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state.values?.email} error={fe.email} />
      <PasswordInput label="Password" name="password" autoComplete="new-password" error={fe.password} hint="At least 10 characters, with a letter and a number." />
      <fieldset>
        <legend className="mb-2 text-[0.95rem] font-semibold">
          Age <span className="text-danger" aria-hidden="true">*</span>
        </legend>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-3">
            <input type="radio" name="age_confirmation" value="adult" defaultChecked={state.values?.age_confirmation === "adult"} className="h-5 w-5 accent-[var(--teal)]" />
            I am 18 or older
          </label>
          <label className="flex items-center gap-3">
            <input type="radio" name="age_confirmation" value="minor" defaultChecked={state.values?.age_confirmation === "minor"} className="h-5 w-5 accent-[var(--teal)]" />
            I am 13 to 17
          </label>
        </div>
        <p className="mt-1.5 text-sm text-ink-muted">You must be at least 13 to join. Volunteers under 18 need a parent or guardian&apos;s consent for each opportunity.</p>
        {fe.age_confirmation ? (
          <p className="mt-1 text-sm font-semibold text-danger" role="alert">
            {fe.age_confirmation}
          </p>
        ) : null}
      </fieldset>
      <Checkbox
        name="accept_terms"
        label={
          <>
            I agree to the{" "}
            <Link href="/terms" className="font-semibold text-teal-strong underline" target="_blank">
              terms
            </Link>{" "}
            and{" "}
            <Link href="/guidelines" className="font-semibold text-teal-strong underline" target="_blank">
              community guidelines
            </Link>
          </>
        }
      />
      {fe.accept_terms ? (
        <p className="-mt-3 text-sm font-semibold text-danger" role="alert">
          {fe.accept_terms}
        </p>
      ) : null}
      <Button type="submit" size="lg" pending={pending}>
        Create account
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(requestPasswordReset, {});
  if (state.ok) return <FormMessage tone="success">{state.message}</FormMessage>;
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      <TextField label="Email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={state.fieldErrors?.email} />
      <Button type="submit" size="lg" pending={pending}>
        Send reset link
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(updatePassword, {});
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      <PasswordInput label="New password" name="password" autoComplete="new-password" error={state.fieldErrors?.password} hint="At least 10 characters, with a letter and a number." />
      <PasswordInput label="Confirm new password" name="confirm_password" autoComplete="new-password" error={state.fieldErrors?.confirm_password} />
      <Button type="submit" size="lg" pending={pending}>
        Update password
      </Button>
    </form>
  );
}

export function ResendConfirmationForm({ email }: { email?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(resendConfirmation, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.message ? <FormMessage tone={state.ok ? "success" : "error"}>{state.message}</FormMessage> : null}
      <input type="hidden" name="email" value={email ?? ""} />
      <Button type="submit" variant="secondary" pending={pending} disabled={!email}>
        Resend confirmation email
      </Button>
    </form>
  );
}
