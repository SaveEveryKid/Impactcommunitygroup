import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { Container, EmptyState } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Messages", robots: { index: false } };

type Conv = {
  id: string;
  subject: string | null;
  kind: string;
  last_message_at: string;
  conversation_participants: { user_id: string | null; org_id: string | null; profiles: { display_name: string } | null; organizations: { name: string } | null }[];
  conversation_reads: { user_id: string; last_read_at: string }[];
};

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  const { before } = await searchParams;
  const user = await requireUser("/inbox");
  const supabase = (await getSupabase())!;
  let q = supabase
    .from("conversations")
    .select("id, subject, kind, last_message_at, conversation_participants(user_id, org_id, profiles(display_name), organizations(name)), conversation_reads(user_id, last_read_at)")
    .order("last_message_at", { ascending: false })
    .limit(30);
  if (before && !Number.isNaN(Date.parse(before))) q = q.lt("last_message_at", before);
  const { data } = await q;
  const convs = (data ?? []) as unknown as Conv[];
  const label = (c: Conv) =>
    c.conversation_participants
      .filter((p) => p.user_id !== user.id)
      .map((p) => p.organizations?.name ?? p.profiles?.display_name ?? "Member")
      .join(", ") || "Conversation";
  return (
    <Container className="max-w-3xl py-10">
      <h1 className="text-3xl font-bold">Messages</h1>
      {convs.length ? (
        <ul className="mt-6 divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-surface">
          {convs.map((c) => {
            const read = c.conversation_reads.find((r) => r.user_id === user.id);
            const unread = !read || new Date(read.last_read_at) < new Date(c.last_message_at);
            return (
              <li key={c.id}>
                <Link href={`/inbox/${c.id}`} className="flex items-start justify-between gap-4 p-4 hover:bg-paper-raised">
                  <span className="min-w-0">
                    <span className={`block truncate ${unread ? "font-bold" : "font-semibold"}`}>{label(c)}</span>
                    <span className="block truncate text-sm text-ink-muted">{c.subject ?? (c.kind === "resource_transfer" ? "Resource transfer" : "Conversation")}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-sm text-ink-muted">
                    {unread ? <span className="h-2.5 w-2.5 rounded-full bg-teal" aria-label="Unread" /> : null}
                    {formatDateTime(c.last_message_at)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-6">
          <EmptyState icon={MessageSquare} title="No conversations yet">
            Message an organization from its profile, or coordinate a transfer from the transfer page.
          </EmptyState>
        </div>
      )}
      {convs.length === 30 ? (
        <Link href={`/inbox?before=${encodeURIComponent(convs[convs.length - 1].last_message_at)}`} className="mt-6 inline-block font-semibold text-teal-strong underline">Older conversations</Link>
      ) : null}
    </Container>
  );
}
