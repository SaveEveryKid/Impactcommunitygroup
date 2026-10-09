"use client";

import { useActionState } from "react";
import { saveCampaign } from "@/app/actions/org-misc";
import { FileUpload } from "@/components/image-upload";
import { Button } from "@/components/ui/button";
import { Checkbox, FormMessage, TextArea, TextField } from "@/components/ui/field";
import type { ActionState } from "@/lib/validation";

type C = { id: string; title: string; summary: string | null; story: string | null; goal_cents: number | null; ends_at: string | null; allow_recurring: boolean; cover_path: string | null };

export function CampaignForm({ orgId, campaign }: { orgId: string; campaign?: C }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveCampaign, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} key={campaign?.id ?? "new"} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="org_id" value={orgId} />
      {campaign ? <input type="hidden" name="campaign_id" value={campaign.id} /> : null}
      {state.message ? <FormMessage tone={state.ok ? "success" : "error"}>{state.message}</FormMessage> : null}
      <TextField label="Title" name="title" required maxLength={140} defaultValue={campaign?.title} error={fe.title} />
      <TextField label="Summary" name="summary" maxLength={300} defaultValue={campaign?.summary ?? ""} />
      <TextArea label="Story" name="story" rows={6} maxLength={10000} defaultValue={campaign?.story ?? ""} hint="What the money does. Be specific and honest." />
      <div className="grid grid-cols-2 gap-4">
        <TextField label="Goal (USD)" name="goal_dollars" type="number" min={1} step="1" defaultValue={campaign?.goal_cents ? String(campaign.goal_cents / 100) : ""} error={fe.goal_dollars} />
        <TextField label="Ends on" name="ends_on" type="date" defaultValue={campaign?.ends_at?.slice(0, 10) ?? ""} />
      </div>
      <Checkbox name="allow_recurring" defaultChecked={campaign?.allow_recurring ?? true} label="Allow monthly and yearly gifts" />
      <FileUpload label="Cover image" prefix={`org/${orgId}/campaigns`} name="cover_path" max={1} initial={campaign?.cover_path ? [campaign.cover_path] : []} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="submit" pending={pending}>Submit for review</Button>
        <Button type="submit" name="intent" value="draft" variant="secondary" pending={pending}>Save draft</Button>
      </div>
    </form>
  );
}
