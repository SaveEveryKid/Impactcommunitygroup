"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser, getSupabase } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/validation";

async function requireUser(next: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const supabase = (await getSupabase())!;
  return { user, supabase };
}

export async function toggleFollow(fd: FormData) {
  const orgId = z.string().uuid().parse(fd.get("org_id"));
  const slug = z.string().parse(fd.get("slug"));
  const { user, supabase } = await requireUser(`/organizations/${slug}`);
  if (fd.get("following") === "true") {
    const { error } = await supabase.from("follows").delete().eq("user_id", user.id).eq("org_id", orgId);
    if (error) throw new Error("Could not unfollow. Try again.");
  } else {
    const { error } = await supabase.from("follows").insert({ user_id: user.id, org_id: orgId });
    if (error && error.code !== "23505") throw new Error("Could not follow. Try again.");
  }
  revalidatePath(`/organizations/${slug}`);
}

const reportSchema = z.object({
  target_type: z.enum(["post", "comment", "message", "organization", "user", "resource", "event", "opportunity"]),
  target_id: z.string().uuid(),
  reason: z.enum(["spam", "harassment", "fraud", "unsafe", "privacy", "inappropriate", "other"]),
  details: z.string().trim().max(2000).optional(),
});

export async function submitReport(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = reportSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, message: "Choose a reason for the report." };
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Sign in to report content." };
  const supabase = (await getSupabase())!;
  const { error } = await supabase.from("content_reports").insert({ ...parsed.data, reporter_id: user.id });
  if (error?.code === "23505") return { ok: true, message: "You've already reported this. Our moderators are reviewing it." };
  if (error) return { ok: false, message: "We couldn't submit your report. Try again." };
  return { ok: true, message: "Thanks. A moderator will review this report." };
}
