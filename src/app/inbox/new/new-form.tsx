"use client";

import { useActionState } from "react";
import { startConversation } from "@/app/actions/messages";
import { Button } from "@/components/ui/button";
import { FormMessage, SelectField, TextArea, TextField } from "@/components/ui/field";
import type { ActionState } from "@/lib/validation";

export function NewConversationForm({ toOrg, toUser, transfer, defaultFrom, senders }: { toOrg?: string; toUser?: string; transfer?: string; defaultFrom?: string; senders: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(startConversation, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {toOrg ? <input type="hidden" name="to_org" value={toOrg} /> : null}
      {toUser ? <input type="hidden" name="to_user" value={toUser} /> : null}
      {transfer ? <input type="hidden" name="transfer" value={transfer} /> : null}
      {state.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      {senders.length ? (
        <SelectField label="Send as" name="from_org" defaultValue={defaultFrom ?? ""} options={[{ value: "", label: "Myself" }, ...senders.map((s) => ({ value: s.id, label: s.name }))]} />
      ) : null}
      <TextField label="Subject" name="subject" maxLength={200} />
      <TextArea label="Message" name="body" rows={6} required maxLength={5000} hint="Don't share sensitive personal or health information." />
      <div><Button type="submit" pending={pending}>Send</Button></div>
    </form>
  );
}
