"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { slugify } from "@/lib/utils";
import { PILLARS } from "@/lib/constants";
import type { ActionState } from "@/lib/validation";

// ------------------------------------------------------------------ posts
const postSchema = z.object({
  org_id: z.string().uuid(),
  kind: z.enum(["update", "announcement", "success_story", "volunteer_request", "community_need", "event", "partnership"]),
  title: z.string().trim().max(160).optional(),
  body: z.string().trim().min(1, "Write something to post").max(5000),
});

export async function createPost(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = postSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const { supabase, org, user } = await requireOrg(parsed.data.org_id, "coordinator");
  if (org.status !== "approved") return { ok: false, message: "Your organization must be approved before posting." };
  const image = String(fd.get("image_path") ?? "");
  const pillars = fd.getAll("pillars").map(String).filter((p) => (PILLARS as readonly string[]).includes(p));
  const { error } = await supabase.from("posts").insert({
    org_id: org.id,
    author_id: user.id,
    kind: parsed.data.kind,
    title: parsed.data.title || null,
    body: parsed.data.body,
    pillars,
    image_path: image.startsWith(`org/${org.id}/`) ? image : null,
  });
  const err = friendlyDbError(error);
  if (err) return { ok: false, message: err };
  revalidatePath(`/organizations/${org.slug}`);
  revalidatePath("/feed");
  revalidatePath(`/dashboard/org/${org.id}/posts`);
  return { ok: true, message: "Posted. Followers will see it in their feed." };
}

export async function deletePost(fd: FormData) {
  const orgId = z.string().uuid().parse(fd.get("org_id"));
  const id = z.string().uuid().parse(fd.get("post_id"));
  const { supabase, org } = await requireOrg(orgId, "admin");
  const { error } = await supabase.from("posts").delete().eq("id", id).eq("org_id", orgId);
  const err = friendlyDbError(error);
  if (err) redirect(`/dashboard/org/${orgId}/posts?error=${encodeURIComponent(err)}`);
  revalidatePath(`/organizations/${org.slug}`);
  revalidatePath(`/dashboard/org/${orgId}/posts`);
}

// ------------------------------------------------------------------ impact
const manualImpact = z.object({
  org_id: z.string().uuid(),
  metric: z.enum(["people_served", "volunteer_hours", "resource_quantity_redistributed", "event_attendance"]),
  quantity: z.coerce.number().positive("Enter a number above zero").max(10_000_000),
  unit: z.string().trim().min(1, "Enter a unit").max(30),
  verification: z.enum(["self_reported", "estimated"]),
  occurred_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  method_note: z.string().trim().min(10, "Explain briefly how you counted this").max(500),
});

export async function addManualImpact(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = manualImpact.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  const { supabase, user } = await requireOrg(parsed.data.org_id, "coordinator");
  if (new Date(parsed.data.occurred_at) > new Date()) return { ok: false, fieldErrors: { occurred_at: "Impact can't be recorded for a future date" } };
  const { error } = await supabase.from("impact_records").insert({
    ...parsed.data,
    occurred_at: `${parsed.data.occurred_at}T12:00:00Z`,
    source_type: "manual",
    recorded_by: user.id,
  });
  const err = friendlyDbError(error);
  if (err) return { ok: false, message: err };
  revalidatePath(`/dashboard/org/${parsed.data.org_id}/impact`);
  return { ok: true, message: `Recorded as ${parsed.data.verification === "estimated" ? "an estimate" : "self-reported"}. It's shown separately from verified totals.` };
}

export async function deleteManualImpact(fd: FormData) {
  const orgId = z.string().uuid().parse(fd.get("org_id"));
  const id = z.string().uuid().parse(fd.get("record_id"));
  const { supabase } = await requireOrg(orgId, "admin");
  await supabase.from("impact_records").delete().eq("id", id).eq("org_id", orgId).eq("source_type", "manual");
  revalidatePath(`/dashboard/org/${orgId}/impact`);
}

// ------------------------------------------------------------------ campaigns
const campaignSchema = z.object({
  org_id: z.string().uuid(),
  campaign_id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  title: z.string().trim().min(3, "Give the campaign a title").max(140),
  summary: z.string().trim().max(300).optional(),
  story: z.string().trim().max(10000).optional(),
  goal_dollars: z.coerce.number().min(0).max(10_000_000).optional(),
  ends_on: z.string().optional(),
  allow_recurring: z.boolean(),
});

export async function saveCampaign(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const raw = Object.fromEntries(fd);
  const parsed = campaignSchema.safeParse({ ...raw, allow_recurring: raw.allow_recurring === "on" });
  if (!parsed.success) return { ok: false, fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  const d = parsed.data;
  const { supabase, org } = await requireOrg(d.org_id, "admin");
  const submit = raw.intent === "submit";
  const row = {
    title: d.title,
    summary: d.summary || null,
    story: d.story || null,
    goal_cents: d.goal_dollars ? Math.round(d.goal_dollars * 100) : null,
    ends_at: d.ends_on && /^\d{4}-\d{2}-\d{2}$/.test(d.ends_on) ? `${d.ends_on}T23:59:59-06:00` : null,
    allow_recurring: d.allow_recurring,
    cover_path: String(fd.get("cover_path") ?? "").startsWith(`org/${org.id}/`) ? String(fd.get("cover_path")) : null,
  };
  if (row.goal_cents !== null && row.goal_cents < 100) return { ok: false, fieldErrors: { goal_dollars: "Goal must be at least $1, or leave it blank" } };
  if (d.campaign_id) {
    const patch: Record<string, unknown> = { ...row };
    if (submit) patch.status = "pending_review";
    const { error } = await supabase.from("fundraising_campaigns").update(patch).eq("id", d.campaign_id).eq("org_id", org.id);
    const err = friendlyDbError(error);
    if (err) return { ok: false, message: err };
  } else {
    const slug = `${slugify(d.title) || "campaign"}-${Math.random().toString(36).slice(2, 6)}`;
    const { error } = await supabase.from("fundraising_campaigns").insert({ ...row, org_id: org.id, slug, status: submit ? "pending_review" : "draft" });
    const err = friendlyDbError(error);
    if (err) return { ok: false, message: err };
  }
  revalidatePath(`/dashboard/org/${org.id}/donations`);
  return { ok: true, message: submit ? "Submitted for review. A platform administrator will approve it before it goes live." : "Campaign saved as a draft." };
}

export async function setCampaignStatus(fd: FormData) {
  const orgId = z.string().uuid().parse(fd.get("org_id"));
  const id = z.string().uuid().parse(fd.get("campaign_id"));
  const status = z.enum(["paused", "active", "completed", "draft"]).parse(fd.get("status"));
  const { supabase } = await requireOrg(orgId, "admin");
  const { error } = await supabase.from("fundraising_campaigns").update({ status }).eq("id", id).eq("org_id", orgId);
  const err = friendlyDbError(error);
  if (err) redirect(`/dashboard/org/${orgId}/donations?error=${encodeURIComponent(err)}`);
  revalidatePath(`/dashboard/org/${orgId}/donations`);
  revalidatePath("/support");
}
