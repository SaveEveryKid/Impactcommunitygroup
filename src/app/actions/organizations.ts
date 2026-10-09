"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser, getSupabase } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { slugify } from "@/lib/utils";
import { type ActionState, echoValues, fieldErrorsFrom, organizationSchema } from "@/lib/validation";
import { sendInvitationEmail } from "@/lib/email";

function parseOrgForm(fd: FormData) {
  const raw = Object.fromEntries(fd);
  return organizationSchema.safeParse({
    ...raw,
    pillars: fd.getAll("pillars"),
    service_categories: String(raw.service_categories ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  });
}

export async function createOrganization(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard/organizations/new");
  if (!user.emailConfirmed) return { ok: false, message: "Confirm your email address before registering an organization." };
  const parsed = parseOrgForm(fd);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error), values: echoValues(fd) };
  const supabase = (await getSupabase())!;
  const base = slugify(parsed.data.name) || "organization";
  let id: string | null = null;
  for (let attempt = 0; attempt < 4 && !id; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await supabase
      .from("organizations")
      .insert({ ...parsed.data, slug, created_by: user.id })
      .select("id")
      .single();
    if (error?.code === "23505") continue;
    const err = friendlyDbError(error);
    if (err) return { ok: false, message: err, values: echoValues(fd) };
    id = data!.id;
  }
  if (!id) return { ok: false, message: "We couldn't create a unique web address for that name. Try a slightly different name.", values: echoValues(fd) };
  redirect(`/dashboard/org/${id}/verification?welcome=1`);
}

export async function updateOrganization(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = z.string().uuid().parse(fd.get("org_id"));
  const { supabase, org } = await requireOrg(orgId, "admin");
  const parsed = parseOrgForm(fd);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error), values: echoValues(fd) };
  const social: Record<string, string> = {};
  for (const k of ["facebook", "instagram", "linkedin", "youtube", "x"]) {
    const v = String(fd.get(`social_${k}`) ?? "").trim();
    if (v) {
      if (!/^https:\/\/[^\s]+$/i.test(v)) return { ok: false, fieldErrors: { [`social_${k}`]: "Use a full https:// link" }, values: echoValues(fd) };
      social[k] = v;
    }
  }
  const { error } = await supabase.from("organizations").update({ ...parsed.data, social_links: social }).eq("id", orgId);
  const err = friendlyDbError(error);
  if (err) return { ok: false, message: err, values: echoValues(fd) };
  revalidatePath(`/organizations/${org.slug}`);
  revalidatePath(`/dashboard/org/${orgId}`, "layout");
  return { ok: true, message: "Profile saved." };
}

export async function setOrgImage(orgId: string, field: "logo_path" | "cover_path", path: string | null) {
  const { supabase, org } = await requireOrg(orgId, "admin");
  if (path && !path.startsWith(`org/${orgId}/`)) throw new Error("Invalid upload path");
  const { error } = await supabase.from("organizations").update({ [field]: path }).eq("id", orgId);
  const err = friendlyDbError(error);
  if (err) throw new Error(err);
  revalidatePath(`/organizations/${org.slug}`);
  revalidatePath(`/dashboard/org/${orgId}`, "layout");
}

const verificationSchema = z.object({
  org_id: z.string().uuid(),
  requested_level: z.enum(["identity_verified", "tax_exempt_verified"]),
  ein: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || /^\d{2}-?\d{7}$/.test(v), "EIN format is 12-3456789"),
  applicant_notes: z.string().trim().max(2000).optional(),
});

export async function submitVerification(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = verificationSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error), values: echoValues(fd) };
  const d = parsed.data;
  if (d.requested_level === "tax_exempt_verified" && !d.ein) {
    return { ok: false, fieldErrors: { ein: "An EIN is required to check tax-exempt status" }, values: echoValues(fd) };
  }
  const { supabase, user } = await requireOrg(d.org_id, "admin");
  const docs = fd
    .getAll("document_paths")
    .map(String)
    .filter((p) => p.startsWith(`org/${d.org_id}/verification/`));
  const { error } = await supabase.from("verification_requests").insert({
    org_id: d.org_id,
    submitted_by: user.id,
    requested_level: d.requested_level,
    ein: d.ein,
    applicant_notes: d.applicant_notes || null,
    document_paths: docs,
  });
  if (error?.code === "23505") return { ok: false, message: "A verification request is already open for this organization." };
  const err = friendlyDbError(error);
  if (err) return { ok: false, message: err };
  revalidatePath(`/dashboard/org/${d.org_id}/verification`);
  return { ok: true, message: "Submitted. Our review team will look at it, usually within a few business days, and you'll get a notification." };
}

// ---------------------------------------------------------------- team
const inviteSchema = z.object({
  org_id: z.string().uuid(),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(["member", "coordinator", "admin"]),
});

export async function inviteMember(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = inviteSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error), values: echoValues(fd) };
  const { supabase, org, user } = await requireOrg(parsed.data.org_id, "admin");
  const { data: token, error } = await supabase.rpc("create_invitation", { p_org: org.id, p_email: parsed.data.email, p_role: parsed.data.role });
  const err = friendlyDbError(error);
  if (err) return { ok: false, message: err, values: echoValues(fd) };
  const sent = await sendInvitationEmail({ to: parsed.data.email, orgName: org.name, inviterName: user.displayName, token: token as string, role: parsed.data.role });
  revalidatePath(`/dashboard/org/${org.id}/team`);
  return sent
    ? { ok: true, message: `Invitation sent to ${parsed.data.email}.` }
    : {
        ok: true,
        message: `Invitation created, but email isn't configured, so share this link with them directly: ${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/invite/${token}`,
      };
}

export async function revokeInvitation(fd: FormData) {
  const id = z.string().uuid().parse(fd.get("invitation_id"));
  const orgId = z.string().uuid().parse(fd.get("org_id"));
  const { supabase } = await requireOrg(orgId, "admin");
  const { error } = await supabase.from("organization_invitations").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("org_id", orgId);
  const err = friendlyDbError(error);
  if (err) throw new Error(err);
  revalidatePath(`/dashboard/org/${orgId}/team`);
}

export async function changeMemberRole(fd: FormData) {
  const orgId = z.string().uuid().parse(fd.get("org_id"));
  const userId = z.string().uuid().parse(fd.get("user_id"));
  const role = z.enum(["member", "coordinator", "admin", "owner"]).parse(fd.get("role"));
  const { supabase } = await requireOrg(orgId, "admin");
  const { error } = await supabase.rpc("set_member_role", { p_org: orgId, p_user: userId, p_role: role });
  const err = friendlyDbError(error);
  if (err) redirect(`/dashboard/org/${orgId}/team?error=${encodeURIComponent(err)}`);
  revalidatePath(`/dashboard/org/${orgId}/team`);
}

export async function removeMember(fd: FormData) {
  const orgId = z.string().uuid().parse(fd.get("org_id"));
  const userId = z.string().uuid().parse(fd.get("user_id"));
  const { supabase, user } = await requireOrg(orgId, "member");
  const { error } = await supabase.rpc("remove_member", { p_org: orgId, p_user: userId });
  const err = friendlyDbError(error);
  if (err) redirect(`/dashboard/org/${orgId}/team?error=${encodeURIComponent(err)}`);
  if (userId === user.id) redirect("/dashboard?notice=left-org");
  revalidatePath(`/dashboard/org/${orgId}/team`);
}

export async function acceptInvitation(fd: FormData) {
  const token = z.string().regex(/^[0-9a-f]{64}$/).parse(fd.get("token"));
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/invite/${token}`);
  const supabase = (await getSupabase())!;
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  const err = friendlyDbError(error);
  if (err) redirect(`/invite/${token}?error=${encodeURIComponent(err)}`);
  redirect(`/dashboard/org/${data}`);
}

// ---------------------------------------------------------- partnerships
export async function requestPartnership(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z
    .object({ from_org: z.string().uuid(), to_org: z.string().uuid(), message: z.string().trim().max(2000).optional() })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, message: "Choose an organization." };
  const { supabase } = await requireOrg(parsed.data.from_org, "admin");
  const { error } = await supabase.rpc("request_partnership", { p_from: parsed.data.from_org, p_to: parsed.data.to_org, p_message: parsed.data.message || null });
  const err = friendlyDbError(error);
  if (err) return { ok: false, message: err };
  revalidatePath(`/dashboard/org/${parsed.data.from_org}/partnerships`);
  return { ok: true, message: "Partnership request sent." };
}

export async function decidePartnership(fd: FormData) {
  const orgId = z.string().uuid().parse(fd.get("org_id"));
  const id = z.string().uuid().parse(fd.get("partnership_id"));
  const status = z.enum(["accepted", "declined", "ended"]).parse(fd.get("status"));
  const { supabase } = await requireOrg(orgId, "admin");
  const { error } = await supabase.rpc("decide_partnership", { p_id: id, p_status: status });
  const err = friendlyDbError(error);
  if (err) redirect(`/dashboard/org/${orgId}/partnerships?error=${encodeURIComponent(err)}`);
  revalidatePath(`/dashboard/org/${orgId}/partnerships`);
}
