"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage, SelectField, TextArea, TextField } from "@/components/ui/field";
import { ORG_TYPES, ORG_TYPE_LABEL, PILLARS, PILLAR_META } from "@/lib/constants";
import type { ActionState } from "@/lib/validation";

type Org = {
  id?: string;
  name?: string;
  org_type?: string;
  mission?: string | null;
  description?: string | null;
  pillars?: string[];
  service_categories?: string[];
  service_area?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  public_email?: string | null;
  public_phone?: string | null;
  website_url?: string | null;
  ein?: string | null;
  social_links?: Record<string, string>;
};

export function OrgForm({ action, org, submitLabel, showSocial = false }: { action: (s: ActionState, fd: FormData) => Promise<ActionState>; org?: Org; submitLabel: string; showSocial?: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const v = (k: keyof Org) => (state.values?.[k as string] ?? (org?.[k] as string | null | undefined) ?? "") as string;
  const fe = state.fieldErrors ?? {};
  const pillars = state.values ? [] : (org?.pillars ?? []);
  return (
    <form action={formAction} className="flex flex-col gap-8" noValidate>
      {org?.id ? <input type="hidden" name="org_id" value={org.id} /> : null}
      {state.message ? <FormMessage tone={state.ok ? "success" : "error"}>{state.message}</FormMessage> : null}
      {Object.keys(fe).length ? <FormMessage tone="error">Check the highlighted fields.</FormMessage> : null}

      <fieldset className="flex flex-col gap-5">
        <legend className="mb-3 font-display text-xl font-semibold">Basics</legend>
        <TextField label="Organization name" name="name" required defaultValue={v("name")} error={fe.name} />
        <SelectField
          label="Type"
          name="org_type"
          required
          defaultValue={v("org_type")}
          placeholder="Choose one"
          options={ORG_TYPES.map((t) => ({ value: t, label: ORG_TYPE_LABEL[t] }))}
          error={fe.org_type}
        />
        <TextArea label="Mission" name="mission" rows={2} required maxLength={500} defaultValue={v("mission")} error={fe.mission} hint="One or two sentences. This appears in search results." />
        <TextArea label="About" name="description" rows={6} maxLength={5000} defaultValue={v("description")} error={fe.description} hint="Programs, who you serve, how people can get involved." />
      </fieldset>

      <fieldset>
        <legend className="mb-1 font-display text-xl font-semibold">Well-being areas</legend>
        <p className="mb-3 text-sm text-ink-muted">Choose every area your work supports.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {PILLARS.map((p) => (
            <label key={p} className="flex items-center gap-3 rounded-[10px] border border-line-strong bg-surface p-3 has-[:checked]:border-teal has-[:checked]:bg-teal-wash">
              <input type="checkbox" name="pillars" value={p} defaultChecked={pillars.includes(p)} className="h-5 w-5 accent-[var(--teal)]" />
              {PILLAR_META[p].label}
            </label>
          ))}
        </div>
        {fe.pillars ? (
          <p className="mt-2 text-sm font-semibold text-danger" role="alert">
            {fe.pillars}
          </p>
        ) : null}
        <TextField
          className="mt-5"
          label="Service categories"
          name="service_categories"
          defaultValue={state.values?.service_categories ?? org?.service_categories?.join(", ") ?? ""}
          hint="Comma-separated, e.g. food pantry, tutoring, job readiness"
        />
      </fieldset>

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="mb-3 font-display text-xl font-semibold">Location</legend>
        <TextField label="City" name="city" required autoComplete="address-level2" defaultValue={v("city")} error={fe.city} />
        <TextField label="State" name="region" required autoComplete="address-level1" defaultValue={v("region")} error={fe.region} />
        <TextField label="ZIP code" name="postal_code" autoComplete="postal-code" inputMode="numeric" defaultValue={v("postal_code")} hint="Used only to estimate distance. Never shown." />
        <TextField label="Service area" name="service_area" defaultValue={v("service_area")} hint="e.g. Lauderdale and Colbert counties" />
      </fieldset>

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="mb-3 font-display text-xl font-semibold">Public contact</legend>
        <TextField label="Public email" name="public_email" type="email" defaultValue={v("public_email")} error={fe.public_email} />
        <TextField label="Public phone" name="public_phone" type="tel" defaultValue={v("public_phone")} />
        <TextField className="sm:col-span-2" label="Website" name="website_url" inputMode="url" defaultValue={v("website_url")} error={fe.website_url} />
        {showSocial
          ? (["facebook", "instagram", "linkedin", "youtube", "x"] as const).map((k) => (
              <TextField
                key={k}
                label={k === "x" ? "X (Twitter)" : k[0].toUpperCase() + k.slice(1)}
                name={`social_${k}`}
                inputMode="url"
                defaultValue={state.values?.[`social_${k}`] ?? org?.social_links?.[k] ?? ""}
                error={fe[`social_${k}`]}
              />
            ))
          : null}
      </fieldset>

      <fieldset>
        <legend className="mb-3 font-display text-xl font-semibold">Tax information</legend>
        <TextField
          label="EIN"
          name="ein"
          defaultValue={v("ein")}
          error={fe.ein}
          hint="Needed only if you want our team to check tax-exempt status. Not shown publicly."
        />
      </fieldset>

      <div>
        <Button type="submit" size="lg" pending={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
