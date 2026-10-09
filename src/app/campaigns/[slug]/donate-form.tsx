"use client";

import { useActionState, useState } from "react";
import { Lock } from "lucide-react";
import { startDonation } from "@/app/actions/donate";
import { Button } from "@/components/ui/button";
import { FormMessage, SelectField, TextArea, TextField } from "@/components/ui/field";
import { formatCurrency } from "@/lib/utils";
import type { ActionState } from "@/lib/validation";

export function DonateForm({ campaignId, amounts, allowRecurring, email, name }: { campaignId: string; amounts: number[]; allowRecurring: boolean; email?: string | null; name?: string | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(startDonation, {});
  const [amount, setAmount] = useState(String(amounts[1] ?? amounts[0] ?? 5000));
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="campaign_id" value={campaignId} />
      {state.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      {allowRecurring ? (
        <fieldset>
          <legend className="mb-2 font-semibold">How often</legend>
          <div className="grid grid-cols-3 gap-2">
            {[["once", "One time"], ["month", "Monthly"], ["year", "Yearly"]].map(([v, l]) => (
              <label key={v} className="flex cursor-pointer items-center justify-center rounded-[10px] border border-line-strong p-2.5 font-semibold has-[:checked]:border-teal has-[:checked]:bg-teal-wash has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-teal/30">
                <input type="radio" name="frequency" value={v} defaultChecked={v === "once"} className="sr-only" />{l}
              </label>
            ))}
          </div>
        </fieldset>
      ) : <input type="hidden" name="frequency" value="once" />}
      <fieldset>
        <legend className="mb-2 font-semibold">Amount</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {amounts.map((a) => (
            <label key={a} className="flex cursor-pointer items-center justify-center rounded-[10px] border border-line-strong p-3 font-display text-lg font-bold has-[:checked]:border-teal has-[:checked]:bg-teal-wash has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-teal/30">
              <input type="radio" name="amount" value={a} checked={amount === String(a)} onChange={() => setAmount(String(a))} className="sr-only" />{formatCurrency(a).replace(".00", "")}
            </label>
          ))}
          <label className="flex cursor-pointer items-center justify-center rounded-[10px] border border-line-strong p-3 font-semibold has-[:checked]:border-teal has-[:checked]:bg-teal-wash">
            <input type="radio" name="amount" value="custom" checked={amount === "custom"} onChange={() => setAmount("custom")} className="sr-only" />Other
          </label>
        </div>
        {amount === "custom" ? <TextField className="mt-3" label="Amount in dollars" name="custom_amount" type="number" min={1} max={50000} step="0.01" inputMode="decimal" required autoFocus error={fe.custom_amount} /> : null}
      </fieldset>
      <TextField label="Your name" name="donor_name" autoComplete="name" defaultValue={name ?? ""} />
      <TextField label="Email for your receipt" name="donor_email" type="email" autoComplete="email" required defaultValue={email ?? ""} error={fe.donor_email} />
      <SelectField label="Show my name" name="visibility" required defaultValue="organization_only" options={[
        { value: "public", label: "Publicly, on the campaign page" },
        { value: "organization_only", label: "Only to the organization" },
        { value: "anonymous", label: "Give anonymously" },
      ]} />
      <TextArea label="Message to the organization" name="message" rows={2} maxLength={500} />
      <Button type="submit" size="lg" pending={pending}><Lock className="h-4 w-4" aria-hidden="true" /> Continue to secure payment</Button>
      <p className="text-sm text-ink-muted">You&apos;ll pay on Stripe&apos;s secure checkout page. We never see your card number. Monthly and yearly gifts can be cancelled any time from your receipt email.</p>
    </form>
  );
}
