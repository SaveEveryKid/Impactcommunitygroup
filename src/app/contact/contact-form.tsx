"use client";

import { useActionState } from "react";
import { submitContact } from "@/app/actions/contact";
import { Button } from "@/components/ui/button";
import { FormMessage, SelectField, TextArea, TextField } from "@/components/ui/field";
import type { ActionState } from "@/lib/validation";

export function ContactForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(submitContact, {});
  if (state.ok) return <FormMessage tone="success">{state.message}</FormMessage>;
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      <TextField label="Your name" name="name" autoComplete="name" required defaultValue={state.values?.name} error={fe.name} />
      <TextField label="Email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={fe.email} />
      <SelectField
        label="What's this about?"
        name="topic"
        required
        defaultValue={state.values?.topic ?? "general"}
        options={[
          { value: "general", label: "General question" },
          { value: "organization", label: "Registering or managing an organization" },
          { value: "volunteer", label: "Volunteering" },
          { value: "sponsor", label: "Sponsorship or funding" },
          { value: "press", label: "Press" },
          { value: "safety", label: "Safety concern" },
        ]}
      />
      <TextArea label="Message" name="message" rows={6} required maxLength={4000} defaultValue={state.values?.message} error={fe.message} />
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Leave this empty
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <Button type="submit" size="lg" pending={pending}>
        Send message
      </Button>
    </form>
  );
}
