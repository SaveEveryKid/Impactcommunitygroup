"use client";

import { useActionState } from "react";
import { registerForEvent } from "@/app/actions/events";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import type { ActionState } from "@/lib/validation";

export function RegisterForm({ eventId, label }: { eventId: string; label: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(registerForEvent, {});
  if (state.ok) return <FormMessage tone="success">{state.message}</FormMessage>;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="event_id" value={eventId} />
      {state.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      <Button type="submit" size="lg" pending={pending}>
        {label}
      </Button>
    </form>
  );
}
