"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser, getSupabase } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import type { ActionState } from "@/lib/validation";

async function authed() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/inbox");
  return { user, supabase: (await getSupabase())! };
}

const startSchema = z.object({
  to_org: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  to_user: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  from_org: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  transfer: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  subject: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1, "Write a message").max(5000),
});

export async function startConversation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await authed();
  const parsed = startSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form" };
  const d = parsed.data;
  const { data, error } = await supabase.rpc("start_conversation", {
    p_kind: d.transfer ? "resource_transfer" : d.to_org ? "organization" : "direct",
    p_subject: d.subject || null,
    p_from_org: d.from_org ?? null,
    p_to_user: d.to_user ?? null,
    p_to_org: d.to_org ?? null,
    p_body: d.body,
    p_transfer: d.transfer ?? null,
    p_event: null,
  });
  const err = friendlyDbError(error);
  if (err) return { ok: false, message: err };
  redirect(`/inbox/${data}`);
}

export async function sendMessage(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user, supabase } = await authed();
  const conv = z.string().uuid().parse(fd.get("conversation_id"));
  const body = String(fd.get("body") ?? "").trim();
  if (!body) return { ok: false, message: "Write a message" };
  if (body.length > 5000) return { ok: false, message: "Messages are limited to 5,000 characters" };
  const asOrg = String(fd.get("sender_org_id") ?? "");
  const { error } = await supabase.from("messages").insert({
    conversation_id: conv,
    sender_id: user.id,
    sender_org_id: /^[0-9a-f-]{36}$/i.test(asOrg) ? asOrg : null,
    body,
  });
  const err = friendlyDbError(error);
  if (err) return { ok: false, message: err === "You don't have permission to do that." ? "You can't send messages in this conversation." : err };
  await supabase.from("conversation_reads").upsert({ conversation_id: conv, user_id: user.id, last_read_at: new Date().toISOString() });
  revalidatePath(`/inbox/${conv}`);
  return { ok: true };
}

export async function toggleBlock(fd: FormData) {
  const { user, supabase } = await authed();
  const target = z.string().uuid().parse(fd.get("user_id"));
  const back = String(fd.get("back") ?? "/inbox");
  if (fd.get("blocked") === "true") await supabase.from("user_blocks").delete().eq("blocker_id", user.id).eq("blocked_id", target);
  else await supabase.from("user_blocks").insert({ blocker_id: user.id, blocked_id: target });
  revalidatePath(back.startsWith("/inbox") ? back : "/inbox");
}

export async function markNotificationsRead(fd: FormData) {
  const { supabase } = await authed();
  const ids = fd.getAll("id").map(String).filter((s) => /^[0-9a-f-]{36}$/i.test(s));
  await supabase.rpc("mark_notifications_read", { p_ids: ids.length ? ids : null });
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}
