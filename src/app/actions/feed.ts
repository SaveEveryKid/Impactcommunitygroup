"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser, getSupabase } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import type { ActionState } from "@/lib/validation";

export async function toggleReaction(fd: FormData) {
  const postId = z.string().uuid().parse(fd.get("post_id"));
  const reaction = z.enum(["support", "thanks", "helpful"]).parse(fd.get("reaction"));
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/feed/${postId}`);
  const supabase = (await getSupabase())!;
  if (fd.get("active") === "true") {
    await supabase.from("post_reactions").delete().eq("post_id", postId).eq("user_id", user.id).eq("reaction", reaction);
  } else {
    await supabase.from("post_reactions").insert({ post_id: postId, user_id: user.id, reaction });
  }
  revalidatePath(`/feed/${postId}`);
  revalidatePath("/feed");
}

export async function addComment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const postId = z.string().uuid().parse(fd.get("post_id"));
  const body = String(fd.get("body") ?? "").trim();
  if (!body || body.length > 2000) return { ok: false, message: "Comments must be between 1 and 2,000 characters." };
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Sign in to comment." };
  const supabase = (await getSupabase())!;
  const { error } = await supabase.from("post_comments").insert({ post_id: postId, author_id: user.id, body });
  const err = friendlyDbError(error);
  if (err) return { ok: false, message: err };
  revalidatePath(`/feed/${postId}`);
  return { ok: true };
}

export async function deleteComment(fd: FormData) {
  const id = z.string().uuid().parse(fd.get("comment_id"));
  const postId = z.string().uuid().parse(fd.get("post_id"));
  const supabase = await getSupabase();
  await supabase?.from("post_comments").delete().eq("id", id);
  revalidatePath(`/feed/${postId}`);
}
