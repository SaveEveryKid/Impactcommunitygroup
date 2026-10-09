import Link from "next/link";
import { Bell, Building2, CalendarDays, Clock, HandHeart, Plus } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Badge, Container, EmptyState } from "@/components/ui/misc";
import { CardGrid, OpportunityCardView } from "@/components/cards";
import { requireUser } from "@/lib/auth";
import { getMyMemberships, getSupabase } from "@/lib/supabase/server";
import { recommendOpportunities } from "@/lib/matching";
import { formatDateTime, formatNumber } from "@/lib/utils";

const NOTICES: Record<string, string> = {
  "password-updated": "Your password was updated.",
  "left-org": "You left the organization.",
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const user = await requireUser();
  const supabase = (await getSupabase())!;
  const memberships = await getMyMemberships();
  const now = new Date().toISOString();

  const [apps, regs, hours, follows, notes, recs] = await Promise.all([
    supabase
      .from("volunteer_applications")
      .select("id, status, shift_id, volunteer_opportunities(id, title, starts_at, timezone, organizations(name)), volunteer_shifts(starts_at)")
      .eq("user_id", user.id)
      .in("status", ["approved", "pending", "waitlisted"])
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("event_registrations")
      .select("id, status, ticket_code, events!inner(id, title, starts_at, timezone, ends_at)")
      .eq("user_id", user.id)
      .in("status", ["confirmed", "waitlisted", "pending_payment"])
      .gte("events.ends_at", now)
      .limit(10),
    supabase.from("volunteer_hours").select("hours, status").eq("user_id", user.id).eq("status", "verified"),
    supabase.from("follows").select("organizations(slug, name)").eq("user_id", user.id).limit(12),
    supabase.from("notifications").select("id, title, body, link_path, created_at, read_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    recommendOpportunities(user.id, 3),
  ]);

  const verifiedHours = (hours.data ?? []).reduce((a, h) => a + Number(h.hours), 0);
  type App = { id: string; status: string; volunteer_opportunities: { id: string; title: string; starts_at: string | null; timezone: string; organizations: { name: string } }; volunteer_shifts: { starts_at: string } | null };
  type Reg = { id: string; status: string; ticket_code: string; events: { id: string; title: string; starts_at: string; timezone: string } };
  const commitments = [
    ...((apps.data ?? []) as unknown as App[]).map((a) => ({
      key: `a-${a.id}`,
      href: `/volunteer/${a.volunteer_opportunities.id}`,
      title: a.volunteer_opportunities.title,
      sub: a.volunteer_opportunities.organizations?.name,
      when: a.volunteer_shifts?.starts_at ?? a.volunteer_opportunities.starts_at,
      tz: a.volunteer_opportunities.timezone,
      status: a.status,
      kind: "Volunteer",
    })),
    ...((regs.data ?? []) as unknown as Reg[]).map((r) => ({
      key: `r-${r.id}`,
      href: `/events/${r.events.id}`,
      title: r.events.title,
      sub: `Ticket ${r.ticket_code}`,
      when: r.events.starts_at,
      tz: r.events.timezone,
      status: r.status,
      kind: "Event",
    })),
  ].sort((a, b) => (a.when ?? "9999").localeCompare(b.when ?? "9999"));

  return (
    <Container className="py-10">
      {notice && NOTICES[notice] ? (
        <div className="mb-6">
          <FormMessage tone="success">{NOTICES[notice]}</FormMessage>
        </div>
      ) : null}
      {!user.emailConfirmed ? (
        <div className="mb-6">
          <FormMessage tone="info">Confirm your email address to volunteer, register for events and create organizations. Check your inbox for the link.</FormMessage>
        </div>
      ) : null}
      <h1 className="text-3xl font-bold sm:text-4xl">Hi, {user.displayName.split(" ")[0]}</h1>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-10">
          {/* Organizations */}
          <section aria-labelledby="orgs">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 id="orgs" className="text-2xl font-semibold">
                Your organizations
              </h2>
              <LinkButton href="/dashboard/organizations/new" size="sm" variant="secondary">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Register one
              </LinkButton>
            </div>
            {memberships.length ? (
              <ul className="grid gap-3 sm:grid-cols-2">
                {memberships.map((m) => (
                  <li key={m.org_id}>
                    <Link href={`/dashboard/org/${m.org_id}`} className="flex items-center gap-4 rounded-[var(--radius-md)] border border-line bg-surface p-4 hover:border-ink/40">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[12px] bg-paper font-display text-lg font-bold">{m.organizations.name.slice(0, 1)}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{m.organizations.name}</span>
                        <span className="flex flex-wrap items-center gap-2 text-sm capitalize text-ink-muted">
                          {m.role}
                          {m.organizations.status !== "approved" ? <Badge tone="warn">{m.organizations.status === "pending" ? "Awaiting review" : m.organizations.status}</Badge> : null}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-muted">You&apos;re not part of an organization yet. Register yours, or ask an admin to invite you.</p>
            )}
          </section>

          {/* Commitments */}
          <section aria-labelledby="upcoming">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="upcoming" className="text-2xl font-semibold">
                Upcoming commitments
              </h2>
              <Link href="/dashboard/volunteer" className="font-semibold text-teal-strong hover:underline">
                History and hours
              </Link>
            </div>
            {commitments.length ? (
              <ul className="divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-surface">
                {commitments.map((c) => (
                  <li key={c.key} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm text-ink-muted">{c.kind}</p>
                      <Link href={c.href} className="font-semibold hover:underline">
                        {c.title}
                      </Link>
                      <p className="text-sm text-ink-muted">{c.sub}</p>
                    </div>
                    <div className="flex items-center gap-3 sm:text-right">
                      <span className="text-sm">{c.when ? formatDateTime(c.when, c.tz) : "Flexible"}</span>
                      <Badge tone={c.status === "approved" || c.status === "confirmed" ? "teal" : c.status === "pending_payment" ? "danger" : "neutral"}>
                        {c.status === "approved" || c.status === "confirmed" ? "Confirmed" : c.status === "pending_payment" ? "Payment due" : c.status}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={CalendarDays} title="Nothing scheduled" action={<LinkButton href="/volunteer">Find an opportunity</LinkButton>}>
                Volunteer shifts and events you sign up for will show up here.
              </EmptyState>
            )}
          </section>

          {/* Recommendations */}
          <section aria-labelledby="recs">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="recs" className="text-2xl font-semibold">
                Recommended for you
              </h2>
              <Link href="/dashboard/volunteer/profile" className="font-semibold text-teal-strong hover:underline">
                Tune preferences
              </Link>
            </div>
            {recs.length ? (
              <CardGrid>
                {recs.map((r) => (
                  <OpportunityCardView key={r.opp.id} opp={r.opp} />
                ))}
              </CardGrid>
            ) : (
              <p className="text-ink-muted">Add your interests and areas to your volunteer profile to see matches here.</p>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <div className="rounded-[var(--radius-lg)] bg-ink p-6 text-white">
            <p className="flex items-center gap-2 text-white/70">
              <Clock className="h-4 w-4" aria-hidden="true" />
              Verified volunteer hours
            </p>
            <p className="mt-1 font-display text-5xl font-bold text-marigold">{formatNumber(verifiedHours, 1)}</p>
            <Link href="/dashboard/volunteer" className="mt-3 inline-block text-sm font-semibold text-white underline">
              See your record
            </Link>
          </div>

          <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Bell className="h-5 w-5" aria-hidden="true" /> Notifications
              </h2>
              <Link href="/notifications" className="text-sm font-semibold text-teal-strong hover:underline">
                All
              </Link>
            </div>
            {notes.data?.length ? (
              <ul className="mt-3 space-y-3">
                {notes.data.map((n) => (
                  <li key={n.id}>
                    <Link href={n.link_path ?? "/notifications"} className="block hover:underline">
                      <span className={n.read_at ? "" : "font-semibold"}>{n.title}</span>
                    </Link>
                    <span className="text-sm text-ink-muted">{formatDateTime(n.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-ink-muted">You&apos;re all caught up.</p>
            )}
          </section>

          <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Building2 className="h-5 w-5" aria-hidden="true" /> Following
            </h2>
            {follows.data?.length ? (
              <ul className="mt-3 space-y-2">
                {(follows.data as unknown as { organizations: { slug: string; name: string } }[]).map((f) => (
                  <li key={f.organizations.slug}>
                    <Link href={`/organizations/${f.organizations.slug}`} className="font-semibold text-teal-strong hover:underline">
                      {f.organizations.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-ink-muted">
                Follow organizations to see their updates in your <Link href="/feed" className="underline">feed</Link>.
              </p>
            )}
          </section>

          <LinkButton href="/volunteer" variant="secondary" className="w-full">
            <HandHeart className="h-4 w-4" aria-hidden="true" />
            Browse opportunities
          </LinkButton>
        </aside>
      </div>
    </Container>
  );
}
