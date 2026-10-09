"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser, getSupabase } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import { isStripeConfigured } from "@/lib/stripe";
import type { ActionState } from "@/lib/validation";

export async function registerForEvent(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const eventId = z.string().uuid().safeParse(fd.get("event_id"));
  if (!eventId.success) return { ok: false, message: "Unknown event." };
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/events/${eventId.data}`);
  if (!user.emailConfirmed) return { ok: false, message: "Confirm your email address before registering." };
  const supabase = (await getSupabase())!;

  const { data: ev } = await supabase.from("events").select("price_cents").eq("id", eventId.data).maybeSingle();
  if (!ev) return { ok: false, message: "This event isn't available." };
  if (ev.price_cents > 0 && !isStripeConfigured()) {
    return { ok: false, message: "Paid registration opens once payments are set up for this site. No seat was reserved." };
  }

  const { data, error } = await supabase.rpc("register_for_event", { p_event: eventId.data });
  const err = friendlyDbError(error);
  if (err) return { ok: false, message: err };
  const reg = data as { id: string; status: string; ticket_code: string };
  revalidatePath(`/events/${eventId.data}`);
  if (reg.status === "pending_payment") redirect(`/api/checkout/event?registration=${reg.id}`);
  if (reg.status === "waitlisted") return { ok: true, message: "The event is full, so you're on the waitlist. We'll notify you if a seat opens." };
  return { ok: true, message: `You're registered. Your ticket code is ${reg.ticket_code}. It's also on your dashboard.` };
}

export async function cancelRegistration(fd: FormData) {
  const id = z.string().uuid().parse(fd.get("registration_id"));
  const supabase = await getSupabase();
  if (!supabase) return;
  const { error } = await supabase.rpc("cancel_event_registration", { p_reg: id });
  const err = friendlyDbError(error);
  if (err) throw new Error(err);
  revalidatePath("/dashboard/volunteer");
  const back = fd.get("back");
  if (typeof back === "string" && back.startsWith("/events/")) revalidatePath(back);
}
