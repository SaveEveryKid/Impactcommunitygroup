import type { Metadata } from "next";
import { Container } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth";
import { getMyMemberships, getSupabase } from "@/lib/supabase/server";
import { NewConversationForm } from "./new-form";

export const metadata: Metadata = { title: "New message", robots: { index: false } };

const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);

export default async function NewConversationPage({ searchParams }: { searchParams: Promise<{ to_org?: string; to_user?: string; from_org?: string; transfer?: string }> }) {
  const sp = await searchParams;
  const params = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  await requireUser(`/inbox/new${params ? `?${params}` : ""}`);
  const supabase = (await getSupabase())!;
  const toOrg = uuid(sp.to_org);
  const toUser = uuid(sp.to_user);
  const [{ data: org }, { data: person }, memberships] = await Promise.all([
    toOrg ? supabase.from("organizations").select("id, name").eq("id", toOrg).maybeSingle() : Promise.resolve({ data: null }),
    toUser ? supabase.from("profiles").select("id, display_name").eq("id", toUser).maybeSingle() : Promise.resolve({ data: null }),
    getMyMemberships(),
  ]);
  const senders = memberships.filter((m) => ["owner", "admin", "coordinator"].includes(m.role) && m.org_id !== toOrg).map((m) => ({ id: m.org_id, name: m.organizations.name }));
  const recipient = org?.name ?? person?.display_name;
  return (
    <Container className="max-w-2xl py-10">
      <h1 className="text-3xl font-bold">New message</h1>
      {recipient ? (
        <div className="mt-6 rounded-[var(--radius-lg)] border border-line bg-surface p-6">
          <p className="mb-4">To <strong>{recipient}</strong></p>
          <NewConversationForm toOrg={toOrg} toUser={toUser} transfer={uuid(sp.transfer)} defaultFrom={uuid(sp.from_org)} senders={senders} />
        </div>
      ) : (
        <p className="mt-6 text-ink-muted">Start a conversation from an organization&apos;s profile, a transfer, or a volunteer roster.</p>
      )}
    </Container>
  );
}
