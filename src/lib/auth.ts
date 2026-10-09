import "server-only";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, getSupabase, type SessionUser } from "@/lib/supabase/server";

export type OrgRole = "member" | "coordinator" | "admin" | "owner";
const RANK: Record<OrgRole, number> = { member: 1, coordinator: 2, admin: 3, owner: 4 };

export function roleAtLeast(role: OrgRole | null | undefined, min: OrgRole) {
  return Boolean(role && RANK[role] >= RANK[min]);
}

export async function requireUser(next = "/dashboard"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

export type OrgContext = {
  user: SessionUser;
  org: {
    id: string;
    slug: string;
    name: string;
    status: "pending" | "approved" | "rejected" | "suspended";
    verification_level: "unverified" | "identity_verified" | "tax_exempt_verified";
    org_type: string;
    logo_path: string | null;
  };
  role: OrgRole;
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabase>>>;
};

/**
 * Loads an organization the current user belongs to and enforces a minimum role.
 * This is a UX gate; the database independently enforces the same rules via RLS
 * and security-definer functions.
 */
export async function requireOrg(orgId: string, min: OrgRole = "member"): Promise<OrgContext> {
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) notFound();
  const user = await requireUser(`/dashboard/org/${orgId}`);
  const supabase = (await getSupabase())!;
  const [{ data: member }, { data: org }] = await Promise.all([
    supabase.from("organization_members").select("role").eq("org_id", orgId).eq("user_id", user.id).maybeSingle(),
    supabase.from("organizations").select("id, slug, name, status, verification_level, org_type, logo_path").eq("id", orgId).maybeSingle(),
  ]);
  if (!org || !member) notFound();
  if (!roleAtLeast(member.role as OrgRole, min)) {
    redirect(`/dashboard/org/${orgId}?notice=insufficient-role`);
  }
  return { user, org: org as OrgContext["org"], role: member.role as OrgRole, supabase };
}

export async function requirePlatformStaff(min: "moderator" | "admin" | "super_admin" = "moderator") {
  const user = await requireUser("/admin");
  const order = { moderator: 1, admin: 2, super_admin: 3 } as const;
  if (!user.platformRole || order[user.platformRole] < order[min]) notFound();
  return { user, supabase: (await getSupabase())! };
}
