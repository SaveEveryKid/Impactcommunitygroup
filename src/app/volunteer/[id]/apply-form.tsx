"use client";

import { useActionState } from "react";
import { applyToOpportunity } from "@/app/actions/volunteer";
import { Button } from "@/components/ui/button";
import { Checkbox, FormMessage, TextArea, TextField } from "@/components/ui/field";
import type { ActionState } from "@/lib/validation";

type Shift = { id: string; label: string; remaining: number | null };

export function ApplyForm({ opportunityId, shifts, isAdult, requiresApproval }: { opportunityId: string; shifts: Shift[]; isAdult: boolean; requiresApproval: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(applyToOpportunity, {});
  if (state.ok) return <FormMessage tone="success">{state.message}</FormMessage>;
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="opportunity_id" value={opportunityId} />
      {state.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      {shifts.length ? (
        <fieldset>
          <legend className="mb-2 font-semibold">Choose a shift</legend>
          <div className="flex flex-col gap-2">
            {shifts.map((s, i) => (
              <label key={s.id} className="flex items-start gap-3 rounded-[10px] border border-line-strong p-3 has-[:checked]:border-teal has-[:checked]:bg-teal-wash">
                <input type="radio" name="shift_id" value={s.id} defaultChecked={i === 0} required className="mt-1 h-5 w-5 accent-[var(--teal)]" />
                <span>
                  <span className="block font-semibold">{s.label}</span>
                  <span className="text-sm text-ink-muted">{s.remaining === null ? "Open" : s.remaining > 0 ? `${s.remaining} spots left` : "Full, join the waitlist"}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <TextArea label="Anything the organizer should know?" name="message" rows={3} maxLength={1500} hint="Relevant experience, accessibility needs, or questions." />
      {!isAdult ? (
        <fieldset className="flex flex-col gap-4 rounded-[12px] border border-warn/30 bg-warn-wash p-4">
          <legend className="px-1 font-semibold text-warn">Parent or guardian consent</legend>
          <p className="text-sm text-ink-soft">Volunteers under 18 need a parent or guardian to consent to each opportunity. The organizer will see these details.</p>
          <TextField label="Parent or guardian name" name="guardian_name" required autoComplete="off" />
          <TextField label="Parent or guardian email" name="guardian_email" type="email" required autoComplete="off" />
          <Checkbox name="guardian_consent" required label="My parent or guardian knows about this opportunity and consents to my participation." />
        </fieldset>
      ) : null}
      <Button type="submit" size="lg" pending={pending}>
        {requiresApproval ? "Apply to volunteer" : "Sign up to volunteer"}
      </Button>
    </form>
  );
}
