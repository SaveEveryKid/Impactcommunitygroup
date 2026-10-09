"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { zonedLocalToUtc } from "@/lib/utils";
import { type ActionState, echoValues, fieldErrorsFrom, opportunitySchema } from "@/lib/validation";

const list = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 15);

export async function saveOpportunity(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = z.string().uuid().parse(fd.get("org_id"));
  const oppId = fd.get("opportunity_id") ? z.string().uuid().parse(fd.get("opportunity_id")) : null;
  const { supabase, org } = await requireOrg(orgId, "coordinator");
  const raw = Object.fromEntries(fd);
  const parsed = opportunitySchema.safeParse({
    ...raw,
    skills_required: list(fd.get("skills_required")),
    pillars: fd.getAll("pillars"),
    is_virtual: raw.is_virtual === "on",
    requires_approval: raw.requires_approval === "on",
    allows_minors: raw.allows_minors === "on",
    capacity: raw.capacity ? raw.capacity : null,
    min_age: raw.min_age ? raw.min_age : null,
    publish: raw.intent === "publish",
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error), values: echoValues(fd) };
  const { publish, starts_at, ends_at, ...d } = parsed.data;
  const startIso = starts_at ? zonedLocalToUtc(starts_at, d.timezone) : null;
  const endIso = ends_at ? zonedLocalToUtc(ends_at, d.timezone) : null;
  if (startIso && endIso && endIso <= startIso) return { ok: false, fieldErrors: { ends_at: "End must be after start" }, values: echoValues(fd) };
  if (publish && org.status !== "approved") return { ok: false, message: "Your organization must be approved before publishing.", values: echoValues(fd) };
  const row = { ...d, starts_at: startIso, ends_at: endIso };

  let id = oppId;
  if (!id) {
    const { data, error } = await supabase
      .from("volunteer_opportunities")
      .insert({ ...row, org_id: orgId, status: publish ? "published" : "draft" })
      .select("id")
      .single();
    const err = friendlyDbError(error);
    if (err) return { ok: false, message: err, values: echoValues(fd) };
    id = data!.id;
  } else {
    const patch: Record<string, unknown> = { ...row };
    if (publish) patch.status = "published";
    const { error } = await supabase.from("volunteer_opportunities").update(patch).eq("id", id).eq("org_id", orgId);
    const err = friendlyDbError(error);
    if (err) return { ok: false, message: err, values: echoValues(fd) };
  }
  revalidatePath("/volunteer");
  redirect(`/dashboard/org/${orgId}/volunteers/${id}?saved=1`);
}

export async function setOpportunityStatus(fd: FormData) {
  const orgId = z.string().uuid().parse(fd.get("org_id"));
  const id = z.string().uuid().parse(fd.get("opportunity_id"));
  const status = z.enum(["published", "draft", "closed", "completed", "cancelled"]).parse(fd.get("status"));
  const { supabase } = await requireOrg(orgId, "coordinator");
  const { error } = await supabase.from("volunteer_opportunities").update({ status }).eq("id", id).eq("org_id", orgId);
  const err = friendlyDbError(error);
  if (err) redirect(`/dashboard/org/${orgId}/volunteers/${id}?error=${encodeURIComponent(err)}`);
  revalidatePath(`/dashboard/org/${orgId}/volunteers/${id}`);
  revalidatePath("/volunteer");
}

export async function addShift(fd: FormData) {
  const orgId = z.string().uuid().parse(fd.get("org_id"));
  const oppId = z.string().uuid().parse(fd.get("opportunity_id"));
  const tz = String(fd.get("timezone") ?? "America/Chicago");
  const start = zonedLocalToUtc(String(fd.get("starts_at") ?? ""), tz);
  const end = zonedLocalToUtc(String(fd.get("ends_at") ?? ""), tz);
  const capacity = Number(fd.get("capacity"));
  const back = `/dashboard/org/${orgId}/volunteers/${oppId}`;
  if (!start || !end || end <= start) redirect(`${back}?error=${encodeURIComponent("Enter a shift start and an end after it.")}`);
  if (!Number.isInteger(capacity) || capacity < 1) redirect(`${back}?error=${encodeURIComponent("Shift capacity must be at least 1.")}`);
  const { supabase } = await requireOrg(orgId, "coordinator");
  const { error } = await supabase.from("volunteer_shifts").insert({
    opportunity_id: oppId,
    label: String(fd.get("label") ?? "").slice(0, 80) || null,
    starts_at: start,
    ends_at: end,
    capacity,
  });
  const err = friendlyDbError(error);
  if (err) redirect(`${back}?error=${encodeURIComponent(err)}`);
  revalidatePath(back);
}

export async function deleteShift(fd: FormData) {
  const orgId = z.string().uuid().parse(fd.get("org_id"));
  const oppId = z.string().uuid().parse(fd.get("opportunity_id"));
  const shiftId = z.string().uuid().parse(fd.get("shift_id"));
  const { supabase } = await requireOrg(orgId, "coordinator");
  const { count } = await supabase.from("volunteer_applications").select("id", { count: "exact", head: true }).eq("shift_id", shiftId).in("status", ["approved", "pending", "waitlisted", "completed"]);
  const back = `/dashboard/org/${orgId}/volunteers/${oppId}`;
  if (count) redirect(`${back}?error=${encodeURIComponent("This shift has volunteers. Cancel their sign-ups first, or keep the shift.")}`);
  const { error } = await supabase.from("volunteer_shifts").delete().eq("id", shiftId);
  const err = friendlyDbError(error);
  if (err) redirect(`${back}?error=${encodeURIComponent(err)}`);
  revalidatePath(back);
}

export async function decideApplication(fd: FormData) {
  const orgId = z.string().uuid().parse(fd.get("org_id"));
  const oppId = z.string().uuid().parse(fd.get("opportunity_id"));
  const appId = z.string().uuid().parse(fd.get("application_id"));
  const approve = fd.get("decision") === "approve";
  const { supabase } = await requireOrg(orgId, "coordinator");
  const { error } = await supabase.rpc("decide_volunteer_application", { p_app: appId, p_approve: approve });
  const err = friendlyDbError(error);
  const back = `/dashboard/org/${orgId}/volunteers/${oppId}`;
  if (err) redirect(`${back}?error=${encodeURIComponent(err)}`);
  revalidatePath(back);
}

export async function removeVolunteer(fd: FormData) {
  const orgId = z.string().uuid().parse(fd.get("org_id"));
  const oppId = z.string().uuid().parse(fd.get("opportunity_id"));
  const appId = z.string().uuid().parse(fd.get("application_id"));
  const { supabase } = await requireOrg(orgId, "coordinator");
  const { error } = await supabase.rpc("cancel_volunteer_application", { p_app: appId });
  const err = friendlyDbError(error);
  const back = `/dashboard/org/${orgId}/volunteers/${oppId}`;
  if (err) redirect(`${back}?error=${encodeURIComponent(err)}`);
  revalidatePath(back);
}

export async function recordAttendance(fd: FormData) {
  const orgId = z.string().uuid().parse(fd.get("org_id"));
  const oppId = z.string().uuid().parse(fd.get("opportunity_id"));
  const appId = z.string().uuid().parse(fd.get("application_id"));
  const attended = fd.get("attended") === "yes";
  const hours = attended ? Number(fd.get("hours")) : 0;
  const back = `/dashboard/org/${orgId}/volunteers/${oppId}`;
  if (attended && (!Number.isFinite(hours) || hours <= 0 || hours > 24)) redirect(`${back}?error=${encodeURIComponent("Enter hours between 0.25 and 24.")}`);
  const { supabase } = await requireOrg(orgId, "coordinator");
  const { error } = await supabase.rpc("record_volunteer_attendance", { p_app: appId, p_attended: attended, p_hours: hours, p_note: null });
  const err = friendlyDbError(error);
  if (err) redirect(`${back}?error=${encodeURIComponent(err)}`);
  revalidatePath(back);
}

export async function verifyHours(fd: FormData) {
  const orgId = z.string().uuid().parse(fd.get("org_id"));
  const oppId = String(fd.get("opportunity_id") ?? "");
  const ids = fd.getAll("hours_id").map((v) => z.string().uuid().parse(v));
  const verify = fd.get("decision") !== "reject";
  const { supabase } = await requireOrg(orgId, "coordinator");
  const back = oppId ? `/dashboard/org/${orgId}/volunteers/${oppId}` : `/dashboard/org/${orgId}/volunteers`;
  for (const id of ids) {
    const { error } = await supabase.rpc("verify_volunteer_hours", { p_hours_id: id, p_verify: verify });
    const err = friendlyDbError(error);
    if (err) redirect(`${back}?error=${encodeURIComponent(err)}`);
  }
  revalidatePath(back);
}
