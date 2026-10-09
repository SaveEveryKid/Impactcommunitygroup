"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/supabase/server";
import { createDonationCheckout, PaymentError } from "@/lib/payments";
import { rateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/lib/validation";

const schema = z.object({
  campaign_id: z.string().uuid(),
  amount: z.string(),
  custom_amount: z.string().optional(),
  frequency: z.enum(["once", "month", "year"]),
  donor_name: z.string().trim().max(120).optional(),
  donor_email: z.string().trim().toLowerCase().email("Enter an email for your receipt"),
  visibility: z.enum(["public", "organization_only", "anonymous"]),
  message: z.string().trim().max(500).optional(),
});

export async function startDonation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  const d = parsed.data;
  const dollars = d.amount === "custom" ? Number(d.custom_amount) : Number(d.amount) / 100;
  if (!Number.isFinite(dollars) || dollars < 1 || dollars > 50000) return { ok: false, fieldErrors: { custom_amount: "Enter an amount between $1 and $50,000" } };
  if (!(await rateLimit("donate", 10, 600))) return { ok: false, message: "Too many attempts. Wait a few minutes and try again." };
  const user = await getCurrentUser();
  let url: string;
  try {
    url = await createDonationCheckout({
      campaignId: d.campaign_id,
      orgId: null,
      amountCents: Math.round(dollars * 100),
      recurring: d.frequency !== "once",
      interval: d.frequency === "year" ? "year" : "month",
      donorUserId: user?.id ?? null,
      donorName: d.donor_name || null,
      donorEmail: d.donor_email,
      visibility: d.visibility,
      message: d.message || null,
    });
  } catch (e) {
    if (e instanceof PaymentError) return { ok: false, message: e.message };
    console.error("[donate]", e);
    return { ok: false, message: "We couldn't start checkout. Nothing was charged. Try again in a moment." };
  }
  redirect(url);
}
