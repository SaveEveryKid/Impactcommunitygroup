import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container, EmptyState } from "@/components/ui/misc";
import { markNotificationsRead } from "@/app/actions/messages";
import { requireUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  const { before } = await searchParams;
  const user = await requireUser("/notifications");
  const supabase = (await getSupabase())!;
  let q = supabase.from("notifications").select("id, type, title, body, link_path, read_at, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(40);
  if (before && !Number.isNaN(Date.parse(before))) q = q.lt("created_at", before);
  const { data } = await q;
  const rows = data ?? [];
  const unread = rows.filter((n) => !n.read_at);
  return (
    <Container className="max-w-3xl py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Notifications</h1>
        <div className="flex gap-2">
          {unread.length ? (
            <form action={markNotificationsRead}><Button type="submit" variant="secondary" size="sm">Mark all as read</Button></form>
          ) : null}
          <Link href="/settings/notifications" className="inline-flex h-9 items-center px-3 text-sm font-semibold text-teal-strong underline">Preferences</Link>
        </div>
      </div>
      {rows.length ? (
        <ul className="mt-6 divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-surface">
          {rows.map((n) => (
            <li key={n.id} className={`flex items-start gap-3 p-4 ${n.read_at ? "" : "bg-teal-wash/40"}`}>
              {!n.read_at ? <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-teal" aria-label="Unread" /> : <span className="w-2.5 shrink-0" />}
              <div className="min-w-0 flex-1">
                <Link href={n.link_path ?? "/notifications"} className={`hover:underline ${n.read_at ? "font-semibold" : "font-bold"}`}>{n.title}</Link>
                {n.body ? <p className="text-ink-soft">{n.body}</p> : null}
                <p className="text-sm text-ink-muted">{formatDateTime(n.created_at)}</p>
              </div>
              {!n.read_at ? (
                <form action={markNotificationsRead}><input type="hidden" name="id" value={n.id} /><Button type="submit" variant="ghost" size="sm">Mark read</Button></form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6"><EmptyState icon={Bell} title="No notifications">Requests, approvals, reminders and messages will show up here.</EmptyState></div>
      )}
      {rows.length === 40 ? <Link href={`/notifications?before=${encodeURIComponent(rows[rows.length - 1].created_at)}`} className="mt-6 inline-block font-semibold text-teal-strong underline">Older</Link> : null}
    </Container>
  );
}
