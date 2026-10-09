"use client";

import { useActionState } from "react";
import { requestPartnership } from "@/app/actions/organizations";
import { Button } from "@/components/ui/button";
import { FormMessage, SelectField, TextArea } from "@/components/ui/field";
import type { ActionState } from "@/lib/validation";

export function PartnershipForm({ orgId, orgs }: { orgId: string; orgs: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(requestPartnership, {});
  return (
    <form action={action} key={state.ok ? state.message : "f"} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="from_org" value={orgId} />
      {state.message ? <FormMessage tone={state.ok ? "success" : "error"}>{state.message}</FormMessage> : null}
      <SelectField label="Organization" name="to_org" required placeholder="Choose an organization" options={orgs.map((o) => ({ value: o.id, label: o.name }))} />
      <TextArea label="What would you like to do together?" name="message" rows={4} maxLength={2000} />
      <Button type="submit" pending={pending}>Send request</Button>
    </form>
  );
}
