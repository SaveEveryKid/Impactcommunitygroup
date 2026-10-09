"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { slugify, zonedLocalToUtc } from "@/lib/utils";
import { type ActionState, echoValues, eventSchema, fieldErrorsFrom } from "@/lib/validation";
import { refundCancelledEventRegistrations } from "@/lib/payments";

export async function saveEvent(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = z.string().uuid().parse(fd.get("org_id"));
  const eventId = fd.get("event_id") ? z.string().uuid().parse(fd.get("event_id")) : null;
  const { supabase, org } = await requireOrg(orgId, "coordinator");
  const raw = Object.fromEntries(fd);
  const parsed = eventSchema.safeParse({
    ...raw,
    is_virtual: raw.is_virtual === "on",
    capacity: raw.capacity ? raw.capacity : null,
    price_dollars: raw.price_dollars || 0,
    pillars: fd.getAll("pillars"),
    publish: raw.intent === "publish",
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error), values: echoValues(fd) };
  const { publish, virtual_url, price_dollars, starts_at, ends_at, ...d } = parsed.data;
  if (publish && org.status !== "approved") return { ok: false, message: "Your organization must be approved before publishing.", values: echoValues(fd) };
  const price_cents = Math.round(price_dollars * 100);
  if (price_cents > 0 && price_cents < 100) return { ok: false, fieldErrors: { price_dollars: "Paid tickets must be at least $1.00" }, values: echoValues(fd) };
  if (price_cents > 0 && !process.env.STRIPE_SECRET_KEY) {
    return { ok: false, fieldErrors: { price_dollars: "Paid events need payments to be set up first. Make it free for now." }, values: echoValues(fd) };
  }
  if (price_cents > 0) {
    const { data: acct } = await supabase.from("org_payment_accounts").select("charges_enabled").eq("org_id", orgId).maybeSingle();
    if (!acct?.charges_enabled) return { ok: false, fieldErrors: { price_dollars: "Connect a payment account under Donations before selling tickets." }, values: echoValues(fd) };
  }
  const row = {
    ...d,
    starts_at: zonedLocalToUtc(starts_at, d.timezone),
    ends_at: zonedLocalToUtc(ends_at, d.timezone),
    price_cents,
  };
  if (!row.starts_at || !row.ends_at) return { ok: false, fieldErrors: { starts_at: "Enter a valid date and time" }, values: echoValues(fd) };

  let id = eventId;
  if (!id) {
    const base = slugify(d.title) || "event";
    for (let i = 0; i < 4 && !id; i++) {
      const slug = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
      const { data, error } = await supabase.from("events").insert({ ...row, slug, org_id: orgId, status: publish ? "published" : "draft" }).select("id").single();
      if (error?.code === "23505") continue;
      const err = friendlyDbError(error);
      if (err) return { ok: false, message: err, values: echoValues(fd) };
      id = data!.id;
    }
    if (!id) return { ok: false, message: "Couldn't create the event. Try a slightly different title.", values: echoValues(fd) };
  } else {
    const patch: Record<string, unknown> = { ...row };
    if (publish) patch.status = "published";
    const { error } = await supabase.from("events").update(patch).eq("id", id).eq("org_id", orgId);
    const err = friendlyDbError(error);
    if (err) return { ok: false, message: err, values: echoValues(fd) };
  }
  const instructions = String(fd.get("attendee_instructions") ?? "").slice(0, 2000) || null;
  const { error: pErr } = await supabase.from("event_private_details").upsert({ event_id: id, virtual_url, attendee_instructions: instructions });
  const perr = friendlyDbError(pErr);
  if (perr) return { ok: false, message: `Event saved, but attendee details weren't: ${perr}` };
  const cover = String(fd.get("cover_path") ?? "");
  if (cover.startsWith(`org/${orgId}/`) || cover === "") {
    await supabase.from("events").update({ cover_path: cover || null }).eq("id", id);
  }
  revalidatePath("/events");
  redirect(`/dashboard/org/${orgId}/events/${id}?saved=1`);
}

const ctx = async (fd: FormData) => {
  const orgId = z.string().uuid().parse(fd.get("org_id"));
  const eventId = z.string().uuid().parse(fd.get("event_id"));
  return { orgId, eventId, back: `/dashboard/org/${orgId}/events/${eventId}` };
};

export async function checkIn(fd: FormData) {
  const { orgId, eventId, back } = await ctx(fd);
  const code = String(fd.get("ticket_code") ?? "").trim().toUpperCase();
  const { supabase } = await requireOrg(orgId, "coordinator");
  if (!/^[A-Z0-9]{6,12}$/.test(code)) redirect(`${back}?error=${encodeURIComponent("Enter the ticket code shown on the attendee's confirmation.")}#checkin`);
  const { data, error } = await supabase.rpc("check_in_registration", { p_event: eventId, p_ticket_code: code });
  const err = friendlyDbError(error);
  if (err) redirect(`${back}?error=${encodeURIComponent(err)}#checkin`);
  revalidatePath(back);
  redirect(`${back}?checked=${encodeURIComponent((data as { ticket_code: string }).ticket_code)}#checkin`);
}

export async function cancelEvent(fd: FormData) {
  const { orgId, eventId, back } = await ctx(fd);
  const reason = String(fd.get("reason") ?? "").trim();
  if (fd.get("confirm") !== "on" || reason.length < 5) redirect(`${back}?error=${encodeURIComponent("Give attendees a reason and tick the confirmation box to cancel.")}`);
  const { supabase } = await requireOrg(orgId, "admin");
  const { error } = await supabase.rpc("cancel_event", { p_event: eventId, p_reason: reason.slice(0, 500) });
  const err = friendlyDbError(error);
  if (err) redirect(`${back}?error=${encodeURIComponent(err)}`);
  // Refund paid tickets via Stripe (server-side, idempotent).
  const refund = await refundCancelledEventRegistrations(eventId);
  revalidatePath(back);
  revalidatePath("/events");
  redirect(`${back}?notice=${encodeURIComponent(refund.message)}`);
}

export async function completeEvent(fd: FormData) {
  const { orgId, eventId, back } = await ctx(fd);
  const { supabase } = await requireOrg(orgId, "coordinator");
  const { error } = await supabase.rpc("complete_event", { p_event: eventId });
  const err = friendlyDbError(error);
  if (err) redirect(`${back}?error=${encodeURIComponent(err)}`);
  revalidatePath(back);
}

export async function duplicateEvent(fd: FormData) {
  const { orgId, eventId, back } = await ctx(fd);
  const start = zonedLocalToUtc(String(fd.get("new_start") ?? ""), String(fd.get("timezone") ?? "America/Chicago"));
  if (!start) redirect(`${back}?error=${encodeURIComponent("Choose a start time for the copy.")}`);
  const { supabase } = await requireOrg(orgId, "coordinator");
  const { data, error } = await supabase.rpc("duplicate_event", { p_event: eventId, p_new_start: start });
  const err = friendlyDbError(error);
  if (err) redirect(`${back}?error=${encodeURIComponent(err)}`);
  redirect(`/dashboard/org/${orgId}/events/${data}?saved=1`);
}

export async function cancelAttendee(fd: FormData) {
  const { orgId, back } = await ctx(fd);
  const regId = z.string().uuid().parse(fd.get("registration_id"));
  const { supabase } = await requireOrg(orgId, "coordinator");
  const { error } = await supabase.rpc("cancel_event_registration", { p_reg: regId });
  const err = friendlyDbError(error);
  if (err) redirect(`${back}?error=${encodeURIComponent(err)}`);
  revalidatePath(back);
}

export async function setEventDraft(fd: FormData) {
  const { orgId, eventId, back } = await ctx(fd);
  const { supabase } = await requireOrg(orgId, "coordinator");
  const { count } = await supabase.from("event_registrations").select("id", { count: "exact", head: true }).eq("event_id", eventId).in("status", ["confirmed", "pending_payment", "waitlisted"]);
  if (count) redirect(`${back}?error=${encodeURIComponent("People have registered. Cancel the event instead so they're notified.")}`);
  const { error } = await supabase.from("events").update({ status: "draft" }).eq("id", eventId).eq("org_id", orgId);
  const err = friendlyDbError(error);
  if (err) redirect(`${back}?error=${encodeURIComponent(err)}`);
  revalidatePath(back);
}
