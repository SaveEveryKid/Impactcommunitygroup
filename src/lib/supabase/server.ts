import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Per-request Supabase client acting as the signed-in user (RLS enforced).
 * Returns null when Supabase is not configured so public pages can render
 * an explicit "not connected" state instead of crashing.
 */
export async function getSupabase() {
  if (!isSupabaseConfigured) return null;
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component; middleware refreshes the session instead.
        }
      },
    },
  });
}

export type SessionUser = {
  id: string;
  email: string | null;
  emailConfirmed: boolean;
  displayName: string;
  isAdult: boolean;
  platformRole: "moderator" | "admin" | "super_admin" | null;
};

/** Verified current user (calls Supabase Auth — never trusts the cookie alone). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const [{ data: profile }, { data: admin }] = await Promise.all([
    supabase.from("profiles").select("display_name, is_adult").eq("id", data.user.id).maybeSingle(),
    supabase.from("platform_admins").select("role").eq("user_id", data.user.id).maybeSingle(),
  ]);
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    emailConfirmed: Boolean(data.user.email_confirmed_at),
    displayName: profile?.display_name ?? data.user.email?.split("@")[0] ?? "Member",
    isAdult: profile?.is_adult ?? true,
    platformRole: (admin?.role as SessionUser["platformRole"]) ?? null,
  };
});

export type Membership = {
  org_id: string;
  role: "owner" | "admin" | "coordinator" | "member";
  organizations: { id: string; slug: string; name: string; status: string; logo_path: string | null };
};

export const getMyMemberships = cache(async (): Promise<Membership[]> => {
  const supabase = await getSupabase();
  const user = await getCurrentUser();
  if (!supabase || !user) return [];
  const { data } = await supabase
    .from("organization_members")
    .select("org_id, role, organizations(id, slug, name, status, logo_path)")
    .eq("user_id", user.id)
    .order("created_at");
  return (data ?? []) as unknown as Membership[];
});
