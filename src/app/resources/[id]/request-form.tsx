"use client";

import { useActionState } from "react";
import { requestResource } from "@/app/actions/resources";
import { Button } from "@/components/ui/button";
import { FormMessage, SelectField, TextArea, TextField } from "@/components/ui/field";
import type { ActionState } from "@/lib/validation";

export function RequestForm({ resourceId, orgs, max, unit, kind }: { resourceId: string; orgs: { id: string; name: string }[]; max: number; unit: string; kind: "offer" | "need" }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(requestResource, {});
  if (state.ok) return <FormMessage tone="success">{state.message}</FormMessage>;
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="resource_id" value={resourceId} />
      {state.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      {orgs.length > 1 ? (
        <SelectField label="Requesting as" name="org_id" required options={orgs.map((o) => ({ value: o.id, label: o.name }))} error={fe.org_id} />
      ) : (
        <>
          <input type="hidden" name="org_id" value={orgs[0].id} />
          <p className="text-sm text-ink-muted">Requesting as {orgs[0].name}</p>
        </>
      )}
      <TextField
        label={kind === "need" ? `How much can you provide? (${unit})` : `Quantity (${unit})`}
        name="quantity"
        type="number"
        inputMode="decimal"
        min="0.01"
        step="any"
        max={max}
        required
        hint={`Up to ${max} ${unit}`}
        error={fe.quantity}
      />
      <TextArea label={kind === "need" ? "What you're offering" : "How you'll use it"} name="intended_use" rows={2} maxLength={1000} />
      <TextArea label="Message to the organization" name="message" rows={3} maxLength={2000} hint="Pickup timing, transport, questions." />
      <Button type="submit" pending={pending}>
        {kind === "need" ? "Offer to help" : "Send request"}
      </Button>
    </form>
  );
}
