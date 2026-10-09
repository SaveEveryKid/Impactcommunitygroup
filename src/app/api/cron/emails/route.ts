import { authorizeCron } from "@/lib/cron";
import { getServiceClient } from "@/lib/supabase/admin";
import { renderEmail, sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { unsubscribeUrl } from "@/lib/unsubscribe";

export const dynamic = "force-dynamic";

/** Delivers queued notification emails. Safe to run concurrently (rows are claimed with SKIP LOCKED). */
export async function GET(req: Request) {
  if (!authorizeCron(req)) return new Response("Unauthorized", { status: 401 });
  const sb = getServiceClient();
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    // Not configured: mark pending emails skipped so in-app delivery still works and the queue doesn't grow forever.
    await sb.from("notifications").update({ email_status: "skipped", email_error: "email provider not configured" }).eq("email_status", "pending");
    return Response.json({ sent: 0, skipped: true });
  }
  const { data: batch, error } = await sb.rpc("claim_email_batch", { p_limit: 50 });
  if (error) return new Response("Could not claim batch", { status: 500 });
  let sent = 0;
  let failed = 0;
  for (const n of (batch ?? []) as { id: string; user_id: string; email: string; display_name: string | null; title: string; body: string | null; link_path: string | null }[]) {
    const url = `${siteUrl}${n.link_path ?? "/notifications"}`;
    const res = await sendEmail({
      to: n.email,
      subject: n.title,
      html: renderEmail({ heading: n.title, body: `${n.display_name ? `Hi ${n.display_name},\n\n` : ""}${n.body ?? ""}`, ctaLabel: "Open", ctaUrl: url, unsubscribe: unsubscribeUrl(n.user_id) }),
      text: `${n.title}\n\n${n.body ?? ""}\n\n${url}\n\nUnsubscribe: ${unsubscribeUrl(n.user_id)}`,
      headers: { "List-Unsubscribe": `<${unsubscribeUrl(n.user_id)}>` },
      idempotencyKey: `notif-${n.id}`,
    });
    if (res.ok) {
      sent++;
      await sb.from("notifications").update({ email_status: "sent", email_error: null }).eq("id", n.id);
    } else {
      failed++;
      await sb.from("notifications").update({ email_error: res.error.slice(0, 500) }).eq("id", n.id);
    }
  }
  // Rows that hit 3 attempts become 'failed' so they stop retrying.
  await sb.from("notifications").update({ email_status: "failed" }).eq("email_status", "pending").gte("email_attempts", 3);
  return Response.json({ sent, failed });
}
