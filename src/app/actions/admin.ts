"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePlatformStaff } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { getServiceClient } from "@/lib/supabase/admin";
import type { ActionState } from "@/lib/validation";

const back = (path: string, err: string | null) => {
  if (err) redirect(`${path}?error=${encodeURIComponent(err)}`);
  revalidatePath(path);
};

/** Audit entry for actions executed with the service role (where auth.uid() is null). */
async function audit(actorId: string, action: string, targetType: string, targetId: string, metadata: Record<string, unknown> = {}, orgId: string | null = null) {
  await getServiceClient().from("audit_logs").insert({ actor_id: actorId, action, target_type: targetType, target_id: targetId, org_id: orgId, metadata });
}

// ------------------------------------------------------------ organizations
export async function decideVerification(fd: FormData) {
  const { supabase } = await requirePlatformStaff("admin");
  const id = z.string().uuid().parse(fd.get("request_id"));
  const decision = z.enum(["in_review", "needs_info", "approved", "rejected"]).parse(fd.get("decision"));
  const note = String(fd.get("note") ?? "").trim().slice(0, 2000);
  if ((decision === "needs_info" || decision === "rejected") && note.length < 5) back("/admin/verifications", "Explain what's needed or why it was rejected.");
  const { error } = await supabase.rpc("decide_verification", { p_request: id, p_decision: decision, p_note: note || null, p_tax_exempt_checked: fd.get("tax_checked") === "on" });
  back("/admin/verifications", friendlyDbError(error));
}

export async function setOrgStatus(fd: FormData) {
  const { supabase } = await requirePlatformStaff("admin");
  const id = z.string().uuid().parse(fd.get("org_id"));
  const status = z.enum(["approved", "suspended", "rejected", "pending"]).parse(fd.get("status"));
  const reason = String(fd.get("reason") ?? "").trim();
  if (fd.get("confirm") !== "on") back("/admin/organizations", "Tick the confirmation box to change an organization's status.");
  const { error } = await supabase.rpc("admin_set_org_status", { p_org: id, p_status: status, p_reason: reason });
  back("/admin/organizations", friendlyDbError(error));
}

export async function toggleFeatured(fd: FormData) {
  const { supabase, user } = await requirePlatformStaff("admin");
  const id = z.string().uuid().parse(fd.get("org_id"));
  const featured = fd.get("featured") === "true";
  const { error } = await supabase.from("organizations").update({ is_featured: !featured }).eq("id", id);
  if (!error) await audit(user.id, featured ? "organization.unfeatured" : "organization.featured", "organization", id, {}, id);
  revalidatePath("/");
  back("/admin/organizations", friendlyDbError(error));
}

// ------------------------------------------------------------ moderation
export async function resolveReport(fd: FormData) {
  const { supabase, user } = await requirePlatformStaff("moderator");
  const id = z.string().uuid().parse(fd.get("report_id"));
  const action = z.enum(["dismiss", "hide", "remove", "restore", "review"]).parse(fd.get("action"));
  const note = String(fd.get("note") ?? "").trim().slice(0, 2000) || null;
  const { data: report } = await supabase.from("content_reports").select("target_type, target_id").eq("id", id).single();
  if (!report) back("/admin/reports", "Report not found.");
  if (["hide", "remove", "restore"].includes(action)) {
    const { error } = await supabase.rpc("moderate_content", { p_type: report!.target_type, p_id: report!.target_id, p_action: action, p_note: note });
    const err = friendlyDbError(error);
    if (err) back("/admin/reports", err);
  }
  const status = action === "review" ? "reviewing" : action === "dismiss" ? "dismissed" : "resolved";
  const { error } = await supabase
    .from("content_reports")
    .update({ status, resolution: note ?? action, resolved_by: action === "review" ? null : user.id, resolved_at: action === "review" ? null : new Date().toISOString() })
    .eq("id", id);
  back("/admin/reports", friendlyDbError(error));
}

export async function lockConversation(fd: FormData) {
  const { user } = await requirePlatformStaff("moderator");
  const id = z.string().uuid().parse(fd.get("conversation_id"));
  const lock = fd.get("lock") === "true";
  await getServiceClient().from("conversations").update({ is_locked: lock }).eq("id", id);
  await audit(user.id, lock ? "moderation.conversation_locked" : "moderation.conversation_unlocked", "conversation", id);
  back("/admin/reports", null);
}

// ------------------------------------------------------------ campaigns
export async function decideCampaign(fd: FormData) {
  const { supabase } = await requirePlatformStaff("admin");
  const id = z.string().uuid().parse(fd.get("campaign_id"));
  const approve = fd.get("decision") === "approve";
  const { error } = await supabase.rpc("approve_campaign", { p_campaign: id, p_approve: approve, p_note: String(fd.get("note") ?? "").slice(0, 1000) || null });
  revalidatePath("/support");
  back("/admin/payments", friendlyDbError(error));
}

// ------------------------------------------------------------ users
export async function setPlatformRole(fd: FormData) {
  const { user } = await requirePlatformStaff("super_admin");
  const target = z.string().uuid().parse(fd.get("user_id"));
  const role = z.enum(["none", "moderator", "admin", "super_admin"]).parse(fd.get("role"));
  if (target === user.id) back("/admin/users", "You can't change your own platform role.");
  if (fd.get("confirm") !== "on") back("/admin/users", "Tick the confirmation box to change platform access.");
  const sb = getServiceClient();
  const { error } = role === "none" ? await sb.from("platform_admins").delete().eq("user_id", target) : await sb.from("platform_admins").upsert({ user_id: target, role, granted_by: user.id });
  if (!error) await audit(user.id, `platform.role_${role}`, "user", target);
  back("/admin/users", friendlyDbError(error));
}

export async function processDeletion(fd: FormData) {
  const { user } = await requirePlatformStaff("admin");
  const requestId = z.string().uuid().parse(fd.get("request_id"));
  if (fd.get("confirm") !== "DELETE") back("/admin/users", "Type DELETE to confirm permanent account deletion.");
  const sb = getServiceClient();
  const { data: req } = await sb.from("account_deletion_requests").select("user_id, status").eq("id", requestId).single();
  if (!req || req.status !== "pending") back("/admin/users", "This request isn't pending.");
  // Block if the user is the only owner of any organization.
  const { data: owned } = await sb.from("organization_members").select("org_id").eq("user_id", req!.user_id).eq("role", "owner");
  for (const o of owned ?? []) {
    const { count } = await sb.from("organization_members").select("user_id", { count: "exact", head: true }).eq("org_id", o.org_id).eq("role", "owner");
    if ((count ?? 0) <= 1) back("/admin/users", "This person is the only owner of an organization. Transfer ownership first.");
  }
  await sb.from("account_deletion_requests").update({ status: "processing", processed_by: user.id }).eq("id", requestId);
  const { error } = await sb.auth.admin.deleteUser(req!.user_id);
  if (error) {
    await sb.from("account_deletion_requests").update({ status: "pending" }).eq("id", requestId);
    back("/admin/users", `Deletion failed: ${error.message}`);
  }
  await audit(user.id, "account.deleted", "user", req!.user_id, { request_id: requestId });
  back("/admin/users", null);
}

// ------------------------------------------------------------ content & settings
const contentSchema = z.object({
  key: z.string().regex(/^[a-z0-9_.-]+$/),
  title: z.string().trim().max(200).optional(),
  body: z.string().max(50_000).optional(),
  data: z.string().max(20_000).optional(),
});

export async function saveContent(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requirePlatformStaff("admin");
  const parsed = contentSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, message: "Invalid content key." };
  let data: Record<string, unknown> = {};
  if (parsed.data.data?.trim()) {
    try {
      data = JSON.parse(parsed.data.data);
    } catch {
      return { ok: false, message: "Structured data must be valid JSON." };
    }
  }
  const { error } = await supabase.from("site_content").upsert({ key: parsed.data.key, title: parsed.data.title || null, body: parsed.data.body || null, data, updated_by: user.id, updated_at: new Date().toISOString() });
  const err = friendlyDbError(error);
  if (err) return { ok: false, message: err };
  await audit(user.id, "content.updated", "site_content", parsed.data.key);
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved and published." };
}

export async function saveAnnouncement(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requirePlatformStaff("admin");
  const title = String(fd.get("title") ?? "").trim();
  if (title.length < 3) return { ok: false, message: "Give the announcement a title." };
  const ends = String(fd.get("ends_on") ?? "");
  const { error } = await supabase.from("site_announcements").insert({
    title: title.slice(0, 140),
    body: String(fd.get("body") ?? "").trim().slice(0, 2000) || null,
    link_url: /^https?:\/\/|^\//.test(String(fd.get("link_url") ?? "")) ? String(fd.get("link_url")) : null,
    severity: z.enum(["info", "success", "warning"]).catch("info").parse(fd.get("severity")),
    ends_at: /^\d{4}-\d{2}-\d{2}$/.test(ends) ? `${ends}T23:59:59-06:00` : null,
    created_by: user.id,
  });
  const err = friendlyDbError(error);
  if (err) return { ok: false, message: err };
  await audit(user.id, "announcement.published", "site_announcement", title);
  revalidatePath("/", "layout");
  return { ok: true, message: "Announcement is live." };
}

export async function endAnnouncement(fd: FormData) {
  const { supabase } = await requirePlatformStaff("admin");
  const id = z.string().uuid().parse(fd.get("id"));
  await supabase.from("site_announcements").update({ is_active: false }).eq("id", id);
  revalidatePath("/", "layout");
  back("/admin/content", null);
}

const SETTINGS: Record<string, z.ZodTypeAny> = {
  "registration.open": z.boolean(),
  "organizations.require_verification_for_fundraising": z.boolean(),
  "payments.live_enabled": z.boolean(),
  "payments.platform_fee_bps": z.number().int().min(0).max(1000),
  environment: z.enum(["production", "demo"]),
};

export async function saveSetting(fd: FormData) {
  const { supabase, user } = await requirePlatformStaff("admin");
  const key = String(fd.get("key"));
  const schema = SETTINGS[key];
  if (!schema) back("/admin/settings", "Unknown setting.");
  if (key === "payments.live_enabled" && user.platformRole !== "super_admin") back("/admin/settings", "Only a super admin can enable live payments.");
  const raw = String(fd.get("value"));
  const value = raw === "true" ? true : raw === "false" ? false : /^-?\d+$/.test(raw) ? Number(raw) : raw;
  const parsed = schema.safeParse(value);
  if (!parsed.success) back("/admin/settings", "Invalid value.");
  if (key === "payments.live_enabled" && value === true && fd.get("confirm") !== "on") back("/admin/settings", "Confirm that legal and Stripe reviews are complete before enabling live payments.");
  const { error } = await supabase.from("platform_settings").update({ value: parsed.data, updated_by: user.id, updated_at: new Date().toISOString() }).eq("key", key);
  if (!error) await audit(user.id, "settings.updated", "platform_setting", key, { value: parsed.data });
  back("/admin/settings", friendlyDbError(error));
}

export async function updateContactMessage(fd: FormData) {
  const { supabase, user } = await requirePlatformStaff("moderator");
  const id = z.string().uuid().parse(fd.get("id"));
  const status = z.enum(["new", "in_progress", "closed", "spam"]).parse(fd.get("status"));
  const { error } = await supabase.from("contact_messages").update({ status, handled_by: user.id }).eq("id", id);
  back("/admin/inbox", friendlyDbError(error));
}

export async function resetDemoData(fd: FormData) {
  const { user } = await requirePlatformStaff("super_admin");
  if (process.env.NEXT_PUBLIC_APP_ENV !== "demo") back("/admin/settings", "Demo reset is only available in the demonstration environment.");
  if (fd.get("confirm") !== "RESET") back("/admin/settings", "Type RESET to confirm.");
  const { error } = await getServiceClient().rpc("reset_demo_data");
  if (!error) await audit(user.id, "demo.reset", "platform", "demo");
  back("/admin/settings", friendlyDbError(error));
}
