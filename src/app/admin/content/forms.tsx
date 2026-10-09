"use client";

import { useActionState } from "react";
import { saveAnnouncement, saveContent } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { FormMessage, SelectField, TextArea, TextField } from "@/components/ui/field";
import type { ActionState } from "@/lib/validation";

export function ContentForm({ contentKey, json, title, body, data }: { contentKey: string; json: boolean; title: string; body: string; data: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveContent, {});
  return (
    <form action={action} className="mt-4 flex flex-col gap-3">
      <input type="hidden" name="key" value={contentKey} />
      {state.message ? <FormMessage tone={state.ok ? "success" : "error"}>{state.message}</FormMessage> : null}
      {json ? (
        <TextArea label="Structured data (JSON)" name="data" rows={8} defaultValue={data} className="font-mono" />
      ) : (
        <>
          <TextField label="Title" name="title" defaultValue={title} />
          <TextArea label="Text" name="body" rows={8} defaultValue={body} hint="Plain text. Blank lines separate paragraphs." />
        </>
      )}
      <div><Button type="submit" size="sm" pending={pending}>Publish</Button></div>
    </form>
  );
}

export function AnnouncementForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveAnnouncement, {});
  return (
    <form action={action} key={state.ok ? state.message : "f"} className="flex flex-col gap-3">
      {state.message ? <FormMessage tone={state.ok ? "success" : "error"}>{state.message}</FormMessage> : null}
      <TextField label="Headline" name="title" required maxLength={140} />
      <TextArea label="Details" name="body" rows={2} maxLength={2000} />
      <TextField label="Link" name="link_url" hint="Optional. A page on this site (/events) or a full https:// link." />
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Style" name="severity" defaultValue="info" options={[{ value: "info", label: "Information" }, { value: "success", label: "Good news" }, { value: "warning", label: "Warning" }]} />
        <TextField label="Show until" name="ends_on" type="date" />
      </div>
      <div><Button type="submit" pending={pending}>Publish announcement</Button></div>
    </form>
  );
}
