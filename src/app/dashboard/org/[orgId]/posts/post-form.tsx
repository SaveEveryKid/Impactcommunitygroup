"use client";

import { useActionState } from "react";
import { createPost } from "@/app/actions/org-misc";
import { FileUpload } from "@/components/image-upload";
import { Button } from "@/components/ui/button";
import { FormMessage, SelectField, TextArea, TextField } from "@/components/ui/field";
import type { ActionState } from "@/lib/validation";

export function PostForm({ orgId }: { orgId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createPost, {});
  return (
    <form action={action} key={state.ok ? state.message : "form"} className="flex flex-col gap-4">
      <input type="hidden" name="org_id" value={orgId} />
      {state.message ? <FormMessage tone={state.ok ? "success" : "error"}>{state.message}</FormMessage> : null}
      <SelectField
        label="Type"
        name="kind"
        required
        defaultValue="update"
        options={[
          { value: "update", label: "Update" },
          { value: "announcement", label: "Announcement" },
          { value: "success_story", label: "Success story" },
          { value: "volunteer_request", label: "Volunteers needed" },
          { value: "community_need", label: "Community need" },
          { value: "partnership", label: "Partnership opportunity" },
        ]}
      />
      <TextField label="Headline" name="title" maxLength={160} />
      <TextArea label="Post" name="body" rows={5} required maxLength={5000} hint="Don't include anyone's private information or health details." />
      <FileUpload label="Image" prefix={`org/${orgId}/posts`} name="image_path" max={1} />
      <div><Button type="submit" pending={pending}>Publish update</Button></div>
    </form>
  );
}
