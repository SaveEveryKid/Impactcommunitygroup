"use client";

import { useActionState } from "react";
import { submitVerification } from "@/app/actions/organizations";
import { FileUpload } from "@/components/image-upload";
import { Button } from "@/components/ui/button";
import { FormMessage, TextArea, TextField } from "@/components/ui/field";
import type { ActionState } from "@/lib/validation";

export function VerificationForm({ orgId, allowIdentity }: { orgId: string; allowIdentity: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(submitVerification, {});
  if (state.ok) return <FormMessage tone="success">{state.message}</FormMessage>;
  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="org_id" value={orgId} />
      {state.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      <fieldset>
        <legend className="mb-3 font-semibold">What should we verify?</legend>
        <div className="flex flex-col gap-2">
          {allowIdentity ? (
            <label className="flex items-start gap-3 rounded-[10px] border border-line-strong p-3 has-[:checked]:border-teal has-[:checked]:bg-teal-wash">
              <input type="radio" name="requested_level" value="identity_verified" defaultChecked className="mt-1 h-5 w-5 accent-[var(--teal)]" />
              <span>
                <span className="block font-semibold">Verify our organization</span>
                <span className="text-sm text-ink-muted">Required to go live. Fits churches, businesses and community groups.</span>
              </span>
            </label>
          ) : null}
          <label className="flex items-start gap-3 rounded-[10px] border border-line-strong p-3 has-[:checked]:border-teal has-[:checked]:bg-teal-wash">
            <input type="radio" name="requested_level" value="tax_exempt_verified" defaultChecked={!allowIdentity} className="mt-1 h-5 w-5 accent-[var(--teal)]" />
            <span>
              <span className="block font-semibold">Verify our organization and check tax-exempt status</span>
              <span className="text-sm text-ink-muted">For 501(c)(3) and similar organizations. Requires your EIN.</span>
            </span>
          </label>
        </div>
      </fieldset>
      <TextField label="EIN" name="ein" error={state.fieldErrors?.ein} hint="Format 12-3456789. Required for the tax-exempt check." defaultValue={state.values?.ein} />
      <FileUpload
        label="Supporting documents"
        hint="Optional: IRS determination letter, state registration, or a letter on your letterhead. PDF, JPG or PNG, up to 10 MB each."
        bucket="documents"
        kind="document"
        prefix={`org/${orgId}/verification`}
        name="document_paths"
        max={5}
      />
      <TextArea label="Anything our reviewers should know?" name="applicant_notes" rows={3} maxLength={2000} defaultValue={state.values?.applicant_notes} />
      <div>
        <Button type="submit" size="lg" pending={pending}>
          Submit for review
        </Button>
      </div>
    </form>
  );
}
