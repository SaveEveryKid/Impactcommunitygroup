"use client";

import { useActionState, useState } from "react";
import { saveEvent } from "@/app/actions/org-events";
import { FileUpload } from "@/components/image-upload";
import { Button } from "@/components/ui/button";
import { Checkbox, FormMessage, SelectField, TextArea, TextField } from "@/components/ui/field";
import { EVENT_TYPES, EVENT_TYPE_LABEL, PILLARS, PILLAR_META } from "@/lib/constants";
import type { ActionState } from "@/lib/validation";

export type EventDraft = {
  id?: string;
  title?: string;
  summary?: string | null;
  description?: string | null;
  event_type?: string;
  starts_local?: string;
  ends_local?: string;
  timezone?: string;
  is_virtual?: boolean;
  venue_name?: string | null;
  venue_address?: string | null;
  general_location?: string | null;
  virtual_url?: string | null;
  attendee_instructions?: string | null;
  visibility?: string;
  capacity?: number | null;
  price_cents?: number;
  pillars?: string[];
  cover_path?: string | null;
  status?: string;
  hasPaidRegistrations?: boolean;
};

export function EventForm({ orgId, event, canPublish, canCharge }: { orgId: string; event?: EventDraft; canPublish: boolean; canCharge: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveEvent, {});
  const [virtual, setVirtual] = useState(event?.is_virtual ?? false);
  const fe = state.fieldErrors ?? {};
  const val = (k: string, fallback: unknown) => (state.values?.[k] ?? fallback ?? "") as string;
  const isDraft = !event?.status || event.status === "draft";
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="org_id" value={orgId} />
      <input type="hidden" name="timezone" value={event?.timezone ?? "America/Chicago"} />
      {event?.id ? <input type="hidden" name="event_id" value={event.id} /> : null}
      {state.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      {Object.keys(fe).length ? <FormMessage tone="error">Check the highlighted fields.</FormMessage> : null}
      <TextField label="Event name" name="title" required maxLength={140} defaultValue={val("title", event?.title)} error={fe.title} />
      <SelectField label="Kind of event" name="event_type" required defaultValue={val("event_type", event?.event_type ?? "other")} options={EVENT_TYPES.map((t) => ({ value: t, label: EVENT_TYPE_LABEL[t] }))} />
      <TextField label="Short summary" name="summary" maxLength={300} defaultValue={val("summary", event?.summary)} />
      <TextArea label="Details" name="description" rows={6} maxLength={8000} defaultValue={val("description", event?.description)} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Starts (Central)" name="starts_at" type="datetime-local" required defaultValue={val("starts_at", event?.starts_local)} error={fe.starts_at} />
        <TextField label="Ends" name="ends_at" type="datetime-local" required defaultValue={val("ends_at", event?.ends_local)} error={fe.ends_at} />
      </div>
      <Checkbox name="is_virtual" checked={virtual} onChange={(e) => setVirtual(e.currentTarget.checked)} label="This event is online" />
      {virtual ? (
        <TextField label="Meeting link" name="virtual_url" inputMode="url" defaultValue={val("virtual_url", event?.virtual_url)} error={fe.virtual_url} hint="Shown only to confirmed attendees. Must start with https://" />
      ) : (
        <>
          <TextField label="Venue name" name="venue_name" maxLength={140} defaultValue={val("venue_name", event?.venue_name)} />
          <TextField label="Venue address" name="venue_address" maxLength={300} defaultValue={val("venue_address", event?.venue_address)} hint="Shown publicly. Use a public venue, not a private home." />
          <TextField label="General area" name="general_location" maxLength={120} defaultValue={val("general_location", event?.general_location)} hint="Town or neighborhood, used for search." />
        </>
      )}
      <TextArea label="Instructions for attendees (private)" name="attendee_instructions" rows={3} maxLength={2000} defaultValue={val("attendee_instructions", event?.attendee_instructions)} hint="Parking, what to bring. Shown only to confirmed attendees." />
      <div className="grid gap-5 sm:grid-cols-3">
        <SelectField
          label="Who can see it"
          name="visibility"
          required
          defaultValue={val("visibility", event?.visibility ?? "public")}
          options={[
            { value: "public", label: "Everyone" },
            { value: "unlisted", label: "Anyone with the link" },
            { value: "private", label: "Our team only" },
          ]}
        />
        <TextField label="Capacity" name="capacity" type="number" min={1} inputMode="numeric" defaultValue={val("capacity", event?.capacity)} hint="Blank for unlimited" />
        <TextField
          label="Ticket price (USD)"
          name={event?.hasPaidRegistrations ? "price_dollars_locked" : "price_dollars"}
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          defaultValue={val("price_dollars", event?.price_cents ? (event.price_cents / 100).toFixed(2) : "0")}
          error={fe.price_dollars}
          disabled={event?.hasPaidRegistrations}
          hint={event?.hasPaidRegistrations ? "Locked: tickets have been sold." : canCharge ? "0 for a free event." : "Connect payments under Donations to sell tickets."}
        />
      </div>
      {event?.hasPaidRegistrations ? <input type="hidden" name="price_dollars" value={((event.price_cents ?? 0) / 100).toFixed(2)} /> : null}
      <FileUpload label="Cover image" hint="Wide image, about 1600 × 900. Use photos you have permission to share." prefix={`org/${orgId}/events`} name="cover_path" max={1} initial={event?.cover_path ? [event.cover_path] : []} />
      <fieldset>
        <legend className="mb-2 font-semibold">Well-being areas</legend>
        <div className="flex flex-wrap gap-2">
          {PILLARS.map((p) => (
            <label key={p} className="flex items-center gap-2 rounded-full border border-line-strong px-3 py-1.5 has-[:checked]:border-teal has-[:checked]:bg-teal-wash">
              <input type="checkbox" name="pillars" value={p} defaultChecked={event?.pillars?.includes(p)} className="h-4 w-4 accent-[var(--teal)]" />
              {PILLAR_META[p].label.replace(" well-being", "")}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-3">
        {isDraft ? (
          <>
            <Button type="submit" name="intent" value="publish" size="lg" pending={pending} disabled={!canPublish}>Publish event</Button>
            <Button type="submit" name="intent" value="draft" size="lg" variant="secondary" pending={pending}>Save draft</Button>
          </>
        ) : (
          <Button type="submit" name="intent" value="save" size="lg" pending={pending}>Save changes</Button>
        )}
      </div>
    </form>
  );
}
