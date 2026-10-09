import type { Metadata } from "next";
import { MailX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/misc";
import { getServiceClient } from "@/lib/supabase/admin";
import { verifyUnsubscribe } from "@/lib/unsubscribe";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

const TYPES = ["message", "resource_request", "resource_request_decided", "transfer_update", "volunteer_application", "volunteer_decision", "volunteer_reminder", "event_registration", "event_reminder", "event_update", "org_invitation", "partnership_request", "partnership_update", "verification_update", "moderation", "announcement"];

async function unsubscribe(fd: FormData) {
  "use server";
  const u = String(fd.get("u") ?? "");
  const t = String(fd.get("t") ?? "");
  if (!verifyUnsubscribe(u, t)) return;
  const sb = getServiceClient();
  await sb.from("notification_preferences").upsert(TYPES.map((type) => ({ user_id: u, type, in_app: true, email: false })));
  await sb.from("email_unsubscribes").upsert({ user_id: u, all_marketing: true });
  redirect("/unsubscribe?done=1");
}

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ u?: string; t?: string; done?: string }> }) {
  const { u = "", t = "", done } = await searchParams;
  if (done) {
    return (
      <Container className="max-w-xl py-20">
        <MailX className="h-10 w-10 text-teal" aria-hidden="true" />
        <h1 className="mt-6 text-3xl font-bold">You&apos;re unsubscribed</h1>
        <p className="mt-4 text-ink-soft">We won&apos;t send notification or announcement emails. You can turn them back on any time in your notification settings.</p>
      </Container>
    );
  }
  const valid = verifyUnsubscribe(u, t);
  return (
    <Container className="max-w-xl py-20">
      <MailX className="h-10 w-10 text-teal" aria-hidden="true" />
      <h1 className="mt-6 text-3xl font-bold">Unsubscribe from emails</h1>
      {valid ? (
        <form action={unsubscribe} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="u" value={u} />
          <input type="hidden" name="t" value={t} />
          <p className="text-ink-soft">This stops all notification and announcement emails. You&apos;ll still see notifications when you sign in, and we&apos;ll still send security emails and donation receipts.</p>
          <div><Button type="submit">Unsubscribe me</Button></div>
          <p className="text-sm text-ink-muted">Prefer to choose which emails you get? Sign in and visit notification settings.</p>
        </form>
      ) : (
        <p className="mt-4 text-ink-soft">This link isn&apos;t valid. Sign in and visit Account settings, then Notifications, to change your email preferences.</p>
      )}
    </Container>
  );
}
