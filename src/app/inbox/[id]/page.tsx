import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/misc";
import { ReportButton } from "@/components/report-button";
import { toggleBlock } from "@/app/actions/messages";
import { requireUser } from "@/lib/auth";
import { getMyMemberships, getSupabase } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import { Composer } from "./composer";

export const metadata: Metadata = { title: "Conversation", robots: { index: false } };

type Msg = { id: string; body: string; created_at: string; sender_id: string | null; sender_org_id: string | null; profiles: { display_name: string } | null; organizations: { name: string } | null };

export default async function ConversationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ before?: string }> }) {
  const { id } = await params;
  const { before } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireUser(`/inbox/${id}`);
  const supabase = (await getSupabase())!;
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, subject, kind, is_locked, resource_transfer_id, conversation_participants(user_id, org_id, profiles(display_name), organizations(name, slug))")
    .eq("id", id)
    .maybeSingle();
  if (!conv) notFound();
  let q = supabase
    .from("messages")
    .select("id, body, created_at, sender_id, sender_org_id, profiles:sender_id(display_name), organizations:sender_org_id(name)")
    .eq("conversation_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (before && !Number.isNaN(Date.parse(before))) q = q.lt("created_at", before);
  const [{ data: msgs }, { data: blocks }, memberships] = await Promise.all([
    q,
    supabase.from("user_blocks").select("blocked_id").eq("blocker_id", user.id),
    getMyMemberships(),
  ]);
  await supabase.from("conversation_reads").upsert({ conversation_id: id, user_id: user.id, last_read_at: new Date().toISOString() });

  type P = { user_id: string | null; org_id: string | null; profiles: { display_name: string } | null; organizations: { name: string; slug: string } | null };
  const parts = conv.conversation_participants as unknown as P[];
  const others = parts.filter((p) => p.user_id !== user.id);
  const blocked = new Set((blocks ?? []).map((b) => b.blocked_id));
  const sendAsOrgs = memberships
    .filter((m) => ["owner", "admin", "coordinator"].includes(m.role) && parts.some((p) => p.org_id === m.org_id))
    .map((m) => ({ id: m.org_id, name: m.organizations.name }));
  const messages = ((msgs ?? []) as unknown as Msg[]).reverse();

  return (
    <Container className="flex max-w-3xl flex-col py-8">
      <Link href="/inbox" className="font-semibold text-teal-strong hover:underline">All messages</Link>
      <header className="mt-3 border-b border-line pb-4">
        <h1 className="text-2xl font-bold">
          {others.map((p, i) => (
            <span key={i}>
              {i ? ", " : ""}
              {p.organizations ? <Link href={`/organizations/${p.organizations.slug}`} className="hover:underline">{p.organizations.name}</Link> : (p.profiles?.display_name ?? "Member")}
            </span>
          ))}
        </h1>
        {conv.subject ? <p className="text-ink-muted">{conv.subject}</p> : null}
        {conv.resource_transfer_id ? <Link href={`/transfers/${conv.resource_transfer_id}`} className="text-sm font-semibold text-teal-strong underline">View the transfer</Link> : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {others.filter((p) => p.user_id).map((p) => (
            <form key={p.user_id} action={toggleBlock}>
              <input type="hidden" name="user_id" value={p.user_id!} />
              <input type="hidden" name="blocked" value={String(blocked.has(p.user_id!))} />
              <input type="hidden" name="back" value={`/inbox/${id}`} />
              <Button type="submit" size="sm" variant="ghost">{blocked.has(p.user_id!) ? `Unblock ${p.profiles?.display_name ?? "member"}` : `Block ${p.profiles?.display_name ?? "member"}`}</Button>
            </form>
          ))}
        </div>
      </header>

      {messages.length === 50 ? (
        <Link href={`/inbox/${id}?before=${encodeURIComponent(messages[0].created_at)}`} className="mt-4 self-center text-sm font-semibold text-teal-strong underline">Load earlier messages</Link>
      ) : null}
      <ol className="mt-6 flex flex-col gap-4" aria-label="Messages">
        {messages.map((m) => {
          const mine = m.sender_id === user.id;
          return (
            <li key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <div className={`max-w-[85%] rounded-[18px] px-4 py-3 ${mine ? "rounded-br-[6px] bg-teal text-white" : "rounded-bl-[6px] border border-line bg-surface"}`}>
                <p className="whitespace-pre-line break-words">{m.body}</p>
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                {mine ? "You" : (m.profiles?.display_name ?? "Member")}
                {m.organizations ? ` for ${m.organizations.name}` : ""}, {formatDateTime(m.created_at)}
              </p>
              {!mine ? <ReportButton targetType="message" targetId={m.id} /> : null}
            </li>
          );
        })}
      </ol>

      <div className="sticky bottom-0 mt-6 border-t border-line bg-paper pb-[calc(1rem+var(--safe-bottom))] pt-4">
        {conv.is_locked ? (
          <p className="text-ink-muted">This conversation was locked by a moderator.</p>
        ) : (
          <Composer conversationId={id} sendAsOrgs={sendAsOrgs} />
        )}
      </div>
    </Container>
  );
}
