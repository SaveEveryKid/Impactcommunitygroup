"use server";

import { getServiceClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { type ActionState, contactSchema, echoValues, fieldErrorsFrom } from "@/lib/validation";

export async function submitContact(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = contactSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) {
    if (parsed.error.issues.some((i) => i.path[0] === "website")) return { ok: true, message: "Thanks, we received your message." };
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error), values: echoValues(fd) };
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, message: "The contact form isn't connected yet. Please email the organization directly.", values: echoValues(fd) };
  }
  if (!(await rateLimit("contact", 5, 3600))) {
    return { ok: false, message: "You've sent several messages recently. Please wait an hour and try again.", values: echoValues(fd) };
  }
  const user = await getCurrentUser();
  const { website: _honeypot, ...row } = parsed.data;
  void _honeypot;
  const { error } = await getServiceClient().from("contact_messages").insert({ ...row, user_id: user?.id ?? null });
  if (error) {
    console.error("[contact] insert failed", error);
    return { ok: false, message: "We couldn't send your message. Try again in a moment.", values: echoValues(fd) };
  }
  return { ok: true, message: "Thanks, we received your message. Someone from our team will reply by email, usually within two business days." };
}
