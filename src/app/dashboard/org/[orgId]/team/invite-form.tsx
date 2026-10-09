"use client";

import { useActionState } from "react";
import { inviteMember } from "@/app/actions/organizations";
import { Button } from "@/components/ui/button";
import { FormMessage, SelectField, TextField } from "@/components/ui/field";
import type { ActionState } from "@/lib/validation";

export function InviteForm({ orgId, canInviteAdmin }: { orgId: string; canInviteAdmin: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(inviteMember, {});
  return (
    <form action={action} className="mt-4 flex flex-col gap-4" key={state.ok ? state.message : "form"}>
      <input type="hidden" name="org_id" value={orgId} />
      {state.message ? <FormMessage tone={state.ok ? "success" : "error"}>{state.message}</FormMessage> : null}
      <TextField label="Email" name="email" type="email" required error={state.fieldErrors?.email} />
      <SelectField
        label="Role"
        name="role"
        required
        defaultValue="coordinator"
        options={[
          { value: "member", label: "Member" },
          { value: "coordinator", label: "Coordinator" },
          ...(canInviteAdmin ? [{ value: "admin", label: "Administrator" }] : []),
        ]}
      />
      <Button type="submit" pending={pending}>
        Send invitation
      </Button>
    </form>
  );
}
