"use server";

import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/auth";
import { echoValues, fieldErrorsFrom, resourceSchema } from "@/lib/validation";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser, getSupabase } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import { zonedLocalToUtc } from "@/lib/utils";
import type { ActionState } from "@/lib/validation";

const requestSchema = z.object({
  resource_id: z.string().uuid(),
  org_id: z.string().uuid({ message: "Choose which organization is requesting" }),
  quantity: z.coerce.number().positive("Enter a quantity greater than zero"),
  message: z.string().trim().max(2000).optional(),
  intended_use: z.string().trim().max(1000).optional(),
});

export async function requestResource(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Sign in to request resources." };
  const parsed = requestSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) {
    return { ok: false, fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  }
  const d = parsed.data;
  const supabase = (await getSupabase())!;
  const { error } = await supabase.rpc("request_resource", {
    p_resource: d.resource_id,
    p_org: d.org_id,
    p_quantity: d.quantity,
    p_message: d.message || null,
    p_intended_use: d.intended_use || null,
  });
  const err = friendlyDbError(error);
  if (err) return { ok: false, message: err === "That already exists." ? "Your organization already has a pending request for this listing." : err };
  revalidatePath(`/resources/${d.resource_id}`);
  return { ok: true, message: "Request sent. The listing organization will review it, and you'll be notified of their decision." };
}

// ------------------------------------------------------------------ org side

function parseResource(fd: FormData) {
  const raw = Object.fromEntries(fd);
  return resourceSchema.safeParse({
    ...raw,
    is_perishable: raw.is_perishable === "on",
    publish: raw.intent === "publish",
  });
}

export async function saveResource(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = z.string().uuid().parse(fd.get("org_id"));
  const resourceId = fd.get("resource_id") ? z.string().uuid().parse(fd.get("resource_id")) : null;
  const { supabase, org } = await requireOrg(orgId, "coordinator");
  const parsed = parseResource(fd);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error), values: echoValues(fd) };
  const { pickup_address, contact_name, contact_phone, publish, ...d } = parsed.data;
  if (publish && org.status !== "approved") {
    return { ok: false, message: "Your organization must be approved before publishing. Save as a draft for now.", values: echoValues(fd) };
  }
  const photos = fd.getAll("photo_paths").map(String).filter((p) => p.startsWith(`org/${orgId}/`)).slice(0, 8);
  const pillars = fd.getAll("pillars").map(String);
  const row = { ...d, photo_paths: photos, pillars };

  let id = resourceId;
  if (!id) {
    const { data, error } = await supabase
      .from("resources")
      .insert({ ...row, org_id: orgId, quantity_available: d.quantity_total, status: publish ? "published" : "draft" })
      .select("id")
      .single();
    const err = friendlyDbError(error);
    if (err) return { ok: false, message: err, values: echoValues(fd) };
    id = data!.id;
  } else {
    const { data: current } = await supabase.from("resources").select("status").eq("id", id).eq("org_id", orgId).single();
    const status = publish && ["draft", "expired"].includes(current?.status ?? "") ? "published" : current?.status;
    const { error } = await supabase.from("resources").update({ ...row, status }).eq("id", id).eq("org_id", orgId);
    const err = friendlyDbError(error);
    if (err) return { ok: false, message: err, values: echoValues(fd) };
  }
  const { error: pErr } = await supabase.from("resource_private_details").upsert({ resource_id: id, pickup_address, contact_name, contact_phone });
  const perr = friendlyDbError(pErr);
  if (perr) return { ok: false, message: `Listing saved, but pickup details weren't: ${perr}` };
  revalidatePath("/resources");
  redirect(`/dashboard/org/${orgId}/resources/${id}?saved=1`);
}

export async function setResourceStatus(fd: FormData) {
  const orgId = z.string().uuid().parse(fd.get("org_id"));
  const id = z.string().uuid().parse(fd.get("resource_id"));
  const status = z.enum(["published", "draft", "cancelled"]).parse(fd.get("status"));
  const { supabase } = await requireOrg(orgId, "coordinator");
  const { error } = await supabase.from("resources").update({ status }).eq("id", id).eq("org_id", orgId);
  const err = friendlyDbError(error);
  if (err) redirect(`/dashboard/org/${orgId}/resources/${id}?error=${encodeURIComponent(err)}`);
  revalidatePath(`/dashboard/org/${orgId}/resources/${id}`);
  revalidatePath("/resources");
}

export async function decideRequest(fd: FormData) {
  const orgId = z.string().uuid().parse(fd.get("org_id"));
  const resourceId = z.string().uuid().parse(fd.get("resource_id"));
  const requestId = z.string().uuid().parse(fd.get("request_id"));
  const approve = fd.get("decision") === "approve";
  const qtyRaw = fd.get("quantity");
  const qty = qtyRaw ? Number(qtyRaw) : null;
  const { supabase } = await requireOrg(orgId, "coordinator");
  const { error } = await supabase.rpc("decide_resource_request", {
    p_request: requestId,
    p_approve: approve,
    p_quantity: approve && qty && qty > 0 ? qty : null,
    p_note: String(fd.get("note") ?? "").slice(0, 1000) || null,
  });
  const err = friendlyDbError(error);
  const base = `/dashboard/org/${orgId}/resources/${resourceId}`;
  if (err) redirect(`${base}?error=${encodeURIComponent(err)}`);
  revalidatePath(base);
  revalidatePath(`/resources/${resourceId}`);
}

export async function cancelMyRequest(fd: FormData) {
  const orgId = z.string().uuid().parse(fd.get("org_id"));
  const id = z.string().uuid().parse(fd.get("request_id"));
  const { supabase } = await requireOrg(orgId, "coordinator");
  const { error } = await supabase.rpc("cancel_resource_request", { p_request: id });
  const err = friendlyDbError(error);
  if (err) redirect(`/dashboard/org/${orgId}/transfers?error=${encodeURIComponent(err)}`);
  revalidatePath(`/dashboard/org/${orgId}/transfers`);
}

const TRANSITIONS = ["scheduled", "collected", "delivered", "completed", "cancelled", "problem"] as const;

export async function transitionTransfer(fd: FormData) {
  const id = z.string().uuid().parse(fd.get("transfer_id"));
  const to = z.enum(TRANSITIONS).parse(fd.get("to"));
  const note = String(fd.get("note") ?? "").trim().slice(0, 2000) || null;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/transfers/${id}`);
  const supabase = (await getSupabase())!;
  const { error } = await supabase.rpc("transition_transfer", { p_transfer: id, p_to: to, p_note: note });
  const err = friendlyDbError(error);
  if (err) redirect(`/transfers/${id}?error=${encodeURIComponent(err)}`);
  revalidatePath(`/transfers/${id}`);
}

export async function scheduleTransfer(fd: FormData) {
  const id = z.string().uuid().parse(fd.get("transfer_id"));
  const start = String(fd.get("window_start") ?? "");
  const end = String(fd.get("window_end") ?? "");
  const volunteer = String(fd.get("volunteer_user_id") ?? "") || null;
  const tz = String(fd.get("timezone") ?? "America/Chicago");
  const supabase = await getSupabase();
  if (!supabase) return;
  const toIso = (local: string) => (local ? zonedLocalToUtc(local, tz) : null);
  const { error } = await supabase.rpc("schedule_transfer", {
    p_transfer: id,
    p_window_start: toIso(start),
    p_window_end: toIso(end),
    p_volunteer: volunteer && /^[0-9a-f-]{36}$/i.test(volunteer) ? volunteer : null,
  });
  const err = friendlyDbError(error);
  if (err) redirect(`/transfers/${id}?error=${encodeURIComponent(err)}`);
  revalidatePath(`/transfers/${id}`);
}
