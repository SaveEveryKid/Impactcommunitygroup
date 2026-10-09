"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PILLARS } from "@/lib/constants";
import { getCurrentUser, getSupabase } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import type { ActionState } from "@/lib/validation";

const list = (v: FormDataEntryValue | null, max: number) =>
  String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max)
    .map((s) => s.slice(0, 60));

async function authed(next: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${next}`);
  return { user, supabase: (await getSupabase())! };
}

export async function saveVolunteerProfile(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user, supabase } = await authed("/dashboard/volunteer/profile");
  const interests = fd.getAll("interests").map(String).filter((p) => (PILLARS as readonly string[]).includes(p));
  const availability = Object.fromEntries(fd.getAll("availability").map((k) => [String(k).slice(0, 30), true]));
  const maxDist = Number(fd.get("max_distance_miles"));
  const { error } = await supabase.from("volunteer_profiles").upsert({
    user_id: user.id,
    interests,
    causes: list(fd.get("causes"), 20),
    skills: list(fd.get("skills"), 30),
    availability,
    service_areas: list(fd.get("service_areas"), 10),
    max_distance_miles: Number.isFinite(maxDist) && maxDist >= 1 && maxDist <= 500 ? Math.round(maxDist) : null,
    is_discoverable: fd.get("is_discoverable") === "on" && user.isAdult,
  });
  const err = friendlyDbError(error);
  if (err) return { ok: false, message: err };
  revalidatePath("/dashboard");
  return { ok: true, message: "Preferences saved. Your recommendations are updated." };
}

const profileSchema = z.object({
  display_name: z.string().trim().min(1, "Enter your name").max(80),
  bio: z.string().trim().max(1000).optional(),
  general_location: z.string().trim().max(120).optional(),
  profile_visibility: z.enum(["public", "members", "private"]),
});

export async function saveProfile(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user, supabase } = await authed("/settings");
  const parsed = profileSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  // Minors can't make their profile public.
  const visibility = !user.isAdult && parsed.data.profile_visibility === "public" ? "members" : parsed.data.profile_visibility;
  const { error } = await supabase
    .from("profiles")
    .update({ ...parsed.data, bio: parsed.data.bio || null, general_location: parsed.data.general_location || null, profile_visibility: visibility })
    .eq("id", user.id);
  const err = friendlyDbError(error);
  if (err) return { ok: false, message: err };
  revalidatePath("/", "layout");
  return { ok: true, message: "Profile saved." };
}

export async function saveNotificationPreferences(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user, supabase } = await authed("/settings/notifications");
  const types = fd.getAll("types").map(String);
  const rows = types.map((t) => ({
    user_id: user.id,
    type: t,
    in_app: true,
    email: fd.get(`email_${t}`) === "on",
  }));
  const { error } = await supabase.from("notification_preferences").upsert(rows);
  const err = friendlyDbError(error);
  if (err) return { ok: false, message: err };
  const unsubscribeAll = fd.get("marketing_off") === "on";
  if (unsubscribeAll) await supabase.from("email_unsubscribes").upsert({ user_id: user.id, all_marketing: true });
  else await supabase.from("email_unsubscribes").delete().eq("user_id", user.id);
  return { ok: true, message: "Notification preferences saved." };
}

export async function requestAccountDeletion(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user, supabase } = await authed("/settings");
  if (fd.get("confirm") !== "DELETE") return { ok: false, message: 'Type DELETE in capitals to confirm.' };
  const { error } = await supabase.from("account_deletion_requests").insert({ user_id: user.id, reason: String(fd.get("reason") ?? "").slice(0, 1000) || null });
  if (error?.code === "23505") return { ok: true, message: "Your deletion request is already being processed." };
  const err = friendlyDbError(error);
  if (err) return { ok: false, message: err };
  revalidatePath("/settings");
  return { ok: true, message: "Deletion requested. We'll remove your personal information within 30 days and email you when it's done. You can cancel until then." };
}

export async function cancelAccountDeletion() {
  const { user, supabase } = await authed("/settings");
  await supabase.from("account_deletion_requests").update({ status: "cancelled" }).eq("user_id", user.id).eq("status", "pending");
  revalidatePath("/settings");
}
