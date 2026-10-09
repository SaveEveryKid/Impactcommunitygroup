"use client";

import { useActionState, useEffect, useRef } from "react";
import { addComment } from "@/app/actions/feed";
import { Button } from "@/components/ui/button";
import { FormMessage, TextArea } from "@/components/ui/field";
import type { ActionState } from "@/lib/validation";

export function CommentForm({ postId }: { postId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addComment, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="post_id" value={postId} />
      {state.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      <TextArea label="Add a comment" name="body" rows={3} required maxLength={2000} />
      <div><Button type="submit" pending={pending}>Post comment</Button></div>
    </form>
  );
}
