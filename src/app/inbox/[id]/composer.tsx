"use client";

import { useActionState, useEffect, useRef } from "react";
import { Send } from "lucide-react";
import { sendMessage } from "@/app/actions/messages";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import type { ActionState } from "@/lib/validation";

export function Composer({ conversationId, sendAsOrgs }: { conversationId: string; sendAsOrgs: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(sendMessage, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="conversation_id" value={conversationId} />
      {state.message && !state.ok ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      {sendAsOrgs.length ? (
        <label className="flex items-center gap-2 text-sm">
          Sending as
          <select name="sender_org_id" defaultValue={sendAsOrgs[0].id} className="h-9 rounded-[8px] border border-line-strong bg-surface px-2">
            {sendAsOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      ) : null}
      <div className="flex items-end gap-2">
        <label htmlFor="body" className="sr-only">Message</label>
        <textarea
          id="body"
          name="body"
          rows={2}
          required
          maxLength={5000}
          placeholder="Write a message"
          className="min-h-12 flex-1 resize-y rounded-[14px] border border-line-strong bg-surface px-4 py-3 text-base focus:border-teal focus:outline-none focus:ring-3 focus:ring-teal/20"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
          }}
        />
        <Button type="submit" pending={pending} aria-label="Send message" className="h-12 w-12 px-0"><Send className="h-5 w-5" aria-hidden="true" /></Button>
      </div>
    </form>
  );
}
