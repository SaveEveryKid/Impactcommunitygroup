"use client";

import { useActionState, useState } from "react";
import { saveResource } from "@/app/actions/resources";
import { FileUpload } from "@/components/image-upload";
import { Button } from "@/components/ui/button";
import { Checkbox, FormMessage, SelectField, TextArea, TextField } from "@/components/ui/field";
import { PILLARS, PILLAR_META, RESOURCE_CATEGORIES, RESOURCE_CATEGORY_LABEL } from "@/lib/constants";
import type { ActionState } from "@/lib/validation";

export type ResourceDraft = {
  id?: string;
  kind?: "offer" | "need";
  title?: string;
  description?: string | null;
  category?: string;
  quantity_total?: number;
  unit?: string;
  general_location?: string | null;
  fulfillment?: string;
  is_perishable?: boolean;
  expires_local?: string;
  handling_requirements?: string | null;
  special_instructions?: string | null;
  photo_paths?: string[];
  pillars?: string[];
  pickup_address?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  status?: string;
};

export function ResourceForm({ orgId, resource, canPublish, reserved = 0 }: { orgId: string; resource?: ResourceDraft; canPublish: boolean; reserved?: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveResource, {});
  const [perishable, setPerishable] = useState(resource?.is_perishable ?? false);
  const [kind, setKind] = useState(resource?.kind ?? "offer");
  const v = (k: keyof ResourceDraft) => (state.values?.[k as string] ?? (resource?.[k] as string | number | undefined) ?? "") as string;
  const fe = state.fieldErrors ?? {};
  const isDraft = !resource?.status || resource.status === "draft";
  return (
    <form action={action} className="flex flex-col gap-8" noValidate>
      <input type="hidden" name="org_id" value={orgId} />
      {resource?.id ? <input type="hidden" name="resource_id" value={resource.id} /> : null}
      {state.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      {Object.keys(fe).length ? <FormMessage tone="error">Check the highlighted fields.</FormMessage> : null}

      <fieldset>
        <legend className="mb-3 font-display text-xl font-semibold">Are you offering or asking?</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["offer", "We have this to give"],
              ["need", "We need this"],
            ] as const
          ).map(([val, label]) => (
            <label key={val} className="flex items-center gap-3 rounded-[10px] border border-line-strong p-3 has-[:checked]:border-teal has-[:checked]:bg-teal-wash">
              <input type="radio" name="kind" value={val} checked={kind === val} onChange={() => setKind(val)} disabled={Boolean(resource?.id)} className="h-5 w-5 accent-[var(--teal)]" />
              {label}
            </label>
          ))}
          {resource?.id ? <input type="hidden" name="kind" value={kind} /> : null}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-5">
        <legend className="mb-3 font-display text-xl font-semibold">What is it?</legend>
        <TextField label="Title" name="title" required maxLength={140} defaultValue={v("title")} error={fe.title} hint="e.g. 200 lbs of fresh vegetables" />
        <SelectField
          label="Category"
          name="category"
          required
          placeholder="Choose a category"
          defaultValue={v("category")}
          options={RESOURCE_CATEGORIES.map((c) => ({ value: c, label: RESOURCE_CATEGORY_LABEL[c] }))}
          error={fe.category}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label={kind === "need" ? "Quantity needed" : "Quantity available"}
            name="quantity_total"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="any"
            required
            defaultValue={v("quantity_total")}
            error={fe.quantity_total}
            hint={reserved > 0 ? `${reserved} already reserved; total can't go below that.` : undefined}
          />
          <TextField label="Unit" name="unit" required maxLength={30} defaultValue={v("unit")} error={fe.unit} hint="lbs, boxes, items, hours" />
        </div>
        <TextArea label="Description" name="description" rows={4} maxLength={4000} defaultValue={v("description")} />
        <FileUpload label="Photos" hint="Up to 8 photos. JPG, PNG or WebP, 5 MB each." prefix={`org/${orgId}/resources`} name="photo_paths" max={8} initial={resource?.photo_paths ?? []} />
      </fieldset>

      <fieldset className="flex flex-col gap-5">
        <legend className="mb-3 font-display text-xl font-semibold">Handling and timing</legend>
        <Checkbox name="is_perishable" checked={perishable} onChange={(e) => setPerishable(e.currentTarget.checked)} label="This is perishable food or has a use-by date" />
        <TextField
          label={perishable ? "Use by" : "Available until"}
          name="expires_at"
          type="datetime-local"
          required={perishable}
          defaultValue={state.values?.expires_at ?? resource?.expires_local ?? ""}
          error={fe.expires_at}
          hint="Central time. The listing hides automatically after this."
        />
        <TextArea label="Handling requirements" name="handling_requirements" rows={2} maxLength={1000} defaultValue={v("handling_requirements")} hint="Refrigeration, lifting help, packaging. You're responsible for accuracy." />
      </fieldset>

      <fieldset className="flex flex-col gap-5">
        <legend className="mb-3 font-display text-xl font-semibold">Pickup and delivery</legend>
        <SelectField
          label="How can it move?"
          name="fulfillment"
          required
          defaultValue={v("fulfillment") || "pickup"}
          options={[
            { value: "pickup", label: "Pickup only" },
            { value: "delivery", label: "We can deliver" },
            { value: "either", label: "Pickup or delivery" },
          ]}
        />
        <TextField label="General area (public)" name="general_location" maxLength={120} defaultValue={v("general_location")} hint="A town or neighborhood, e.g. Downtown Florence" />
        <div className="rounded-[12px] border border-teal/25 bg-teal-wash/50 p-4">
          <p className="mb-4 text-sm text-ink-soft">The details below are private. They&apos;re shown only to the other organization and assigned volunteer after you approve a request.</p>
          <div className="flex flex-col gap-5">
            <TextField label="Pickup address" name="pickup_address" maxLength={300} defaultValue={v("pickup_address")} autoComplete="street-address" />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField label="On-site contact" name="contact_name" maxLength={100} defaultValue={v("contact_name")} />
              <TextField label="Contact phone" name="contact_phone" type="tel" maxLength={40} defaultValue={v("contact_phone")} />
            </div>
          </div>
        </div>
        <TextArea label="Special instructions (public)" name="special_instructions" rows={2} maxLength={1000} defaultValue={v("special_instructions")} />
      </fieldset>

      <fieldset>
        <legend className="mb-3 font-display text-xl font-semibold">Well-being areas</legend>
        <div className="flex flex-wrap gap-2">
          {PILLARS.map((p) => (
            <label key={p} className="flex items-center gap-2 rounded-full border border-line-strong px-3 py-1.5 has-[:checked]:border-teal has-[:checked]:bg-teal-wash">
              <input type="checkbox" name="pillars" value={p} defaultChecked={resource?.pillars?.includes(p)} className="h-4 w-4 accent-[var(--teal)]" />
              {PILLAR_META[p].label.replace(" well-being", "")}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-3">
        {isDraft ? (
          <>
            <Button type="submit" name="intent" value="publish" size="lg" pending={pending} disabled={!canPublish} title={canPublish ? undefined : "Available after your organization is approved"}>
              Publish listing
            </Button>
            <Button type="submit" name="intent" value="draft" size="lg" variant="secondary" pending={pending}>
              Save draft
            </Button>
          </>
        ) : (
          <Button type="submit" name="intent" value="save" size="lg" pending={pending}>
            Save changes
          </Button>
        )}
      </div>
      {!canPublish ? <p className="text-sm text-ink-muted">You can publish once your organization is approved. Drafts are saved in the meantime.</p> : null}
    </form>
  );
}
