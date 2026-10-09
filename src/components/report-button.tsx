"use client";

import { useActionState, useState } from "react";
import { Flag } from "lucide-react";
import { submitReport } from "@/app/actions/social";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import type { ActionState } from "@/lib/validation";

const REASONS = [
  ["spam", "Spam or advertising"],
  ["fraud", "Fraud or scam"],
  ["harassment", "Harassment or hate"],
  ["unsafe", "Unsafe activity"],
  ["privacy", "Shares private information"],
  ["inappropriate", "Inappropriate content"],
  ["other", "Something else"],
] as const;

export function ReportButton({ targetType, targetId, label = "Report" }: { targetType: string; targetId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(submitReport, {});
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm text-ink-muted hover:bg-ink/5 hover:text-ink"
      >
        <Flag className="h-4 w-4" aria-hidden="true" />
        {label}
      </button>
      {open ? (
        state.ok ? (
          <div className="mt-2">
            <FormMessage tone="success">{state.message}</FormMessage>
          </div>
        ) : (
          <form action={action} className="mt-2 flex max-w-sm flex-col gap-3 rounded-[12px] border border-line bg-surface p-4">
            <input type="hidden" name="target_type" value={targetType} />
            <input type="hidden" name="target_id" value={targetId} />
            <fieldset>
              <legend className="mb-2 font-semibold">What&apos;s wrong?</legend>
              {REASONS.map(([v, l]) => (
                <label key={v} className="flex items-center gap-2 py-1">
                  <input type="radio" name="reason" value={v} required className="h-4 w-4 accent-[var(--teal)]" />
                  {l}
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Details (optional)
              <textarea name="details" rows={3} maxLength={2000} className="rounded-[10px] border border-line-strong p-2 font-normal" />
            </label>
            {state.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
            <Button type="submit" size="sm" variant="secondary" pending={pending}>
              Send report
            </Button>
          </form>
        )
      ) : null}
    </div>
  );
}
