"use client";

import { useActionState } from "react";
import { requestAccountDeletion, saveNotificationPreferences, saveProfile } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { FormMessage, SelectField, TextArea, TextField } from "@/components/ui/field";
import type { ActionState } from "@/lib/validation";

export function ProfileForm({ profile, isAdult }: { profile: { display_name: string; bio: string | null; general_location: string | null; profile_visibility: string }; isAdult: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveProfile, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      {state.message ? <FormMessage tone={state.ok ? "success" : "error"}>{state.message}</FormMessage> : null}
      <TextField label="Display name" name="display_name" required defaultValue={profile.display_name} error={state.fieldErrors?.display_name} />
      <TextArea label="About you" name="bio" rows={3} maxLength={1000} defaultValue={profile.bio ?? ""} />
      <TextField label="General location" name="general_location" defaultValue={profile.general_location ?? ""} hint="A town or area, never a street address." />
      <SelectField
        label="Who can see your profile"
        name="profile_visibility"
        required
        defaultValue={profile.profile_visibility}
        options={[
          ...(isAdult ? [{ value: "public", label: "Anyone" }] : []),
          { value: "members", label: "Signed-in members" },
          { value: "private", label: "Only me and organizations I volunteer with" },
        ]}
      />
      <div><Button type="submit" pending={pending}>Save profile</Button></div>
    </form>
  );
}

export function DeletionForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(requestAccountDeletion, {});
  if (state.ok) return <div className="mt-3"><FormMessage tone="success">{state.message}</FormMessage></div>;
  return (
    <form action={action} className="mt-3 flex flex-col gap-4">
      <p className="text-ink-soft">We&apos;ll remove your profile, messages and volunteer preferences. Donation receipts are kept as required by law, without your profile attached. If you&apos;re the only owner of an organization, transfer ownership first.</p>
      {state.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      <TextArea label="Why are you leaving?" name="reason" rows={2} maxLength={1000} />
      <TextField label='Type DELETE to confirm' name="confirm" required autoComplete="off" />
      <div><Button type="submit" variant="danger" pending={pending}>Request account deletion</Button></div>
    </form>
  );
}

export function NotificationForm({ types, prefs, marketingOff }: { types: { type: string; label: string }[]; prefs: Record<string, boolean>; marketingOff: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveNotificationPreferences, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      {state.message ? <FormMessage tone={state.ok ? "success" : "error"}>{state.message}</FormMessage> : null}
      <fieldset>
        <legend className="mb-1 font-semibold">Email me about</legend>
        <p className="mb-3 text-sm text-ink-muted">You&apos;ll always see these in your notification center. Security emails (password resets, sign-in changes) are always sent.</p>
        <ul className="divide-y divide-line rounded-[12px] border border-line">
          {types.map((t) => (
            <li key={t.type} className="flex items-center justify-between gap-4 p-3">
              <input type="hidden" name="types" value={t.type} />
              <label htmlFor={`email_${t.type}`} className="flex-1">{t.label}</label>
              <input id={`email_${t.type}`} type="checkbox" name={`email_${t.type}`} defaultChecked={prefs[t.type] ?? true} className="h-5 w-5 accent-[var(--teal)]" />
            </li>
          ))}
        </ul>
      </fieldset>
      <label className="flex items-center gap-3">
        <input type="checkbox" name="marketing_off" defaultChecked={marketingOff} className="h-5 w-5 accent-[var(--teal)]" />
        Don&apos;t email me platform announcements
      </label>
      <div><Button type="submit" pending={pending}>Save preferences</Button></div>
    </form>
  );
}
