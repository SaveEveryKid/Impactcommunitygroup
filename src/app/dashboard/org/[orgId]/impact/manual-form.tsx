"use client";

import { useActionState } from "react";
import { addManualImpact } from "@/app/actions/org-misc";
import { Button } from "@/components/ui/button";
import { FormMessage, SelectField, TextArea, TextField } from "@/components/ui/field";
import type { ActionState } from "@/lib/validation";

export function ManualImpactForm({ orgId }: { orgId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addManualImpact, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} key={state.ok ? state.message : "f"} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="org_id" value={orgId} />
      {state.message ? <FormMessage tone={state.ok ? "success" : "error"}>{state.message}</FormMessage> : null}
      <SelectField label="What" name="metric" required options={[
        { value: "people_served", label: "People served" },
        { value: "volunteer_hours", label: "Volunteer hours" },
        { value: "resource_quantity_redistributed", label: "Resources distributed" },
        { value: "event_attendance", label: "Event attendance" },
      ]} />
      <div className="grid grid-cols-2 gap-4">
        <TextField label="Amount" name="quantity" type="number" min="0.01" step="any" required error={fe.quantity} />
        <TextField label="Unit" name="unit" required defaultValue="people" error={fe.unit} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <TextField label="Date" name="occurred_at" type="date" required error={fe.occurred_at} />
        <SelectField label="Basis" name="verification" required options={[{ value: "self_reported", label: "Counted (sign-in sheet, records)" }, { value: "estimated", label: "Estimated" }]} />
      </div>
      <TextArea label="How did you count this?" name="method_note" rows={2} required maxLength={500} error={fe.method_note} hint="e.g. Sign-in sheets from our Tuesday meal" />
      <div><Button type="submit" pending={pending} variant="secondary">Add record</Button></div>
    </form>
  );
}
