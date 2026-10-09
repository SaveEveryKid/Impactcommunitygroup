import Link from "next/link";
import { CalendarHeart, Plus } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/misc";
import { requireOrg, roleAtLeast } from "@/lib/auth";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default async function OrgEvents({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { role, supabase } = await requireOrg(orgId);
  const { data } = await supabase
    .from("events")
    .select("id, title, status, starts_at, timezone, capacity, price_cents, visibility, event_registrations(status)")
    .eq("org_id", orgId)
    .order("starts_at", { ascending: false })
    .limit(200);
  type E = { id: string; title: string; status: string; starts_at: string; timezone: string; capacity: number | null; price_cents: number; visibility: string; event_registrations: { status: string }[] };
  const rows = (data ?? []) as unknown as E[];
  const now = Date.now();
  const upcoming = rows.filter((e) => new Date(e.starts_at).getTime() >= now).reverse();
  const past = rows.filter((e) => new Date(e.starts_at).getTime() < now);
  const Row = ({ e }: { e: E }) => {
    const going = e.event_registrations.filter((r) => ["confirmed", "checked_in"].includes(r.status)).length;
    const wait = e.event_registrations.filter((r) => r.status === "waitlisted").length;
    return (
      <li className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href={`/dashboard/org/${orgId}/events/${e.id}`} className="font-semibold hover:underline">{e.title}</Link>
          <p className="text-sm text-ink-muted">{formatDateTime(e.starts_at, e.timezone)}{e.price_cents ? `, ${formatCurrency(e.price_cents)}` : ", free"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="teal">{going} going{e.capacity ? ` of ${e.capacity}` : ""}</Badge>
          {wait ? <Badge>{wait} waitlisted</Badge> : null}
          <Badge tone={e.status === "cancelled" ? "danger" : e.status === "draft" ? "warn" : "neutral"}>{e.status}</Badge>
          {e.visibility !== "public" ? <Badge>{e.visibility}</Badge> : null}
        </div>
      </li>
    );
  };
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Events</h2>
        {roleAtLeast(role, "coordinator") ? <LinkButton href={`/dashboard/org/${orgId}/events/new`}><Plus className="h-4 w-4" aria-hidden="true" /> New event</LinkButton> : null}
      </div>
      {rows.length ? (
        <>
          <section>
            <h3 className="text-lg font-semibold">Upcoming</h3>
            {upcoming.length ? <ul className="mt-3 divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-surface">{upcoming.map((e) => <Row key={e.id} e={e} />)}</ul> : <p className="mt-2 text-ink-muted">Nothing scheduled.</p>}
          </section>
          {past.length ? (
            <section>
              <h3 className="text-lg font-semibold">Past</h3>
              <ul className="mt-3 divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-surface">{past.map((e) => <Row key={e.id} e={e} />)}</ul>
            </section>
          ) : null}
        </>
      ) : (
        <EmptyState icon={CalendarHeart} title="No events yet" action={roleAtLeast(role, "coordinator") ? <LinkButton href={`/dashboard/org/${orgId}/events/new`}>Create an event</LinkButton> : undefined}>
          Food drives, workshops, community meals. Registration, waitlists and check-in are built in.
        </EmptyState>
      )}
    </div>
  );
}
