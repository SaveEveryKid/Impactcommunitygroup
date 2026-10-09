"use client";

import { useActionState, useState } from "react";
import { saveOpportunity } from "@/app/actions/org-volunteers";
import { Button } from "@/components/ui/button";
import { Checkbox, FormMessage, TextArea, TextField } from "@/components/ui/field";
import { PILLARS, PILLAR_META } from "@/lib/constants";
import type { ActionState } from "@/lib/validation";

export type OppDraft = {
  id?: string;
  title?: string;
  summary?: string | null;
  description?: string | null;
  skills_required?: string[];
  general_location?: string | null;
  is_virtual?: boolean;
  starts_local?: string;
  ends_local?: string;
  capacity?: number | null;
  requires_approval?: boolean;
  allows_minors?: boolean;
  min_age?: number | null;
  pillars?: string[];
  status?: string;
};

export function OpportunityForm({ orgId, opp, canPublish }: { orgId: string; opp?: OppDraft; canPublish: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveOpportunity, {});
  const [minors, setMinors] = useState(opp?.allows_minors ?? false);
  const fe = state.fieldErrors ?? {};
  const val = (k: string, fallback: unknown) => (state.values?.[k] ?? fallback ?? "") as string;
  const isDraft = !opp?.status || opp.status === "draft";
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="org_id" value={orgId} />
      <input type="hidden" name="timezone" value="America/Chicago" />
      {opp?.id ? <input type="hidden" name="opportunity_id" value={opp.id} /> : null}
      {state.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      <TextField label="Title" name="title" required maxLength={140} defaultValue={val("title", opp?.title)} error={fe.title} hint="e.g. Saturday produce sorting" />
      <TextField label="Short summary" name="summary" maxLength={300} defaultValue={val("summary", opp?.summary)} hint="One line shown on listing cards." />
      <TextArea label="What volunteers will do" name="description" rows={6} maxLength={5000} defaultValue={val("description", opp?.description)} />
      <TextField label="Helpful skills" name="skills_required" defaultValue={val("skills_required", opp?.skills_required?.join(", "))} hint="Comma-separated. Used for matching, not as hard requirements." />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Starts (Central)" name="starts_at" type="datetime-local" defaultValue={val("starts_at", opp?.starts_local)} error={fe.starts_at} hint="Leave blank for ongoing roles, or add shifts after saving." />
        <TextField label="Ends" name="ends_at" type="datetime-local" defaultValue={val("ends_at", opp?.ends_local)} error={fe.ends_at} />
      </div>
      <Checkbox name="is_virtual" defaultChecked={opp?.is_virtual} label="This can be done remotely" />
      <TextField label="General location (public)" name="general_location" maxLength={120} defaultValue={val("general_location", opp?.general_location)} hint="Town or neighborhood. Share exact addresses with confirmed volunteers by message." />
      <TextField label="Volunteers needed" name="capacity" type="number" min={1} inputMode="numeric" defaultValue={val("capacity", opp?.capacity)} error={fe.capacity} hint="Leave blank for no limit. When full, new sign-ups join a waitlist. If you add shifts, each shift has its own capacity." />
      <Checkbox name="requires_approval" defaultChecked={opp?.requires_approval ?? true} label="Review each volunteer before confirming them" hint="Turn off to confirm sign-ups automatically up to capacity." />
      <fieldset className="rounded-[12px] border border-line p-4">
        <legend className="px-1 font-semibold">Youth volunteers</legend>
        <Checkbox name="allows_minors" checked={minors} onChange={(e) => setMinors(e.currentTarget.checked)} label="Volunteers aged 13 to 17 may sign up with guardian consent" hint="Your organization is responsible for appropriate supervision and safeguarding." />
        {minors ? <TextField className="mt-4" label="Minimum age" name="min_age" type="number" min={13} max={17} defaultValue={val("min_age", opp?.min_age)} /> : null}
      </fieldset>
      <fieldset>
        <legend className="mb-2 font-semibold">Well-being areas</legend>
        <div className="flex flex-wrap gap-2">
          {PILLARS.map((p) => (
            <label key={p} className="flex items-center gap-2 rounded-full border border-line-strong px-3 py-1.5 has-[:checked]:border-teal has-[:checked]:bg-teal-wash">
              <input type="checkbox" name="pillars" value={p} defaultChecked={opp?.pillars?.includes(p)} className="h-4 w-4 accent-[var(--teal)]" />
              {PILLAR_META[p].label.replace(" well-being", "")}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-3">
        {isDraft ? (
          <>
            <Button type="submit" name="intent" value="publish" size="lg" pending={pending} disabled={!canPublish}>Publish</Button>
            <Button type="submit" name="intent" value="draft" size="lg" variant="secondary" pending={pending}>Save draft</Button>
          </>
        ) : (
          <Button type="submit" name="intent" value="save" size="lg" pending={pending}>Save changes</Button>
        )}
      </div>
    </form>
  );
}
