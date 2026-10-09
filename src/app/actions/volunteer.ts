"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser, getSupabase } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import type { ActionState } from "@/lib/validation";

const applySchema = z.object({
  opportunity_id: z.string().uuid(),
  shift_id: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  message: z.string().trim().max(1500).optional(),
  guardian_name: z.string().trim().max(120).optional(),
  guardian_email: z.string().trim().max(200).optional(),
  guardian_consent: z.literal("on").optional(),
});

export async function applyToOpportunity(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Sign in to volunteer." };
  if (!user.emailConfirmed) return { ok: false, message: "Confirm your email address before signing up." };
  const parsed = applySchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, message: "Check the form and try again." };
  const d = parsed.data;
  const supabase = (await getSupabase())!;
  const { data, error } = await supabase.rpc("apply_to_opportunity", {
    p_opp: d.opportunity_id,
    p_shift: d.shift_id ?? null,
    p_message: d.message || null,
    p_guardian_name: d.guardian_name || null,
    p_guardian_email: d.guardian_email || null,
    p_guardian_consent: d.guardian_consent === "on",
  });
  const err = friendlyDbError(error);
  if (err) return { ok: false, message: err };
  revalidatePath(`/volunteer/${d.opportunity_id}`);
  revalidatePath("/dashboard/volunteer");
  const msg =
    data === "approved"
      ? "You're confirmed. It's on your volunteer dashboard, and we'll send a reminder before it starts."
      : data === "waitlisted"
        ? "It's full right now, so you're on the waitlist. We'll let you know if a spot opens."
        : "Application sent. The organization will review it and you'll get a notification.";
  return { ok: true, message: msg };
}

export async function cancelApplication(fd: FormData) {
  const id = z.string().uuid().parse(fd.get("application_id"));
  const supabase = await getSupabase();
  if (!supabase) return;
  const { error } = await supabase.rpc("cancel_volunteer_application", { p_app: id });
  const err = friendlyDbError(error);
  if (err) throw new Error(err);
  revalidatePath("/dashboard/volunteer");
}
