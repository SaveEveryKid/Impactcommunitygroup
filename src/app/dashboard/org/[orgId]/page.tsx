import Link from "next/link";
import { AlertCircle, CheckCircle2, Inbox, Package, Users, CalendarDays, Truck } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { requireOrg, roleAtLeast } from "@/lib/auth";
import { recommendResourcesForOrg } from "@/lib/matching";
import { IMPACT_METRIC_LABEL } from "@/lib/constants";
import { formatNumber } from "@/lib/utils";

export default async function OrgOverview({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { orgId } = await params;
  const { notice } = await searchParams;
  const { org, role, supabase } = await requireOrg(orgId);
  const isCoord = roleAtLeast(role, "coordinator");

  const [myListings, transfers, opps, events, verification, impact, matches] = await Promise.all([
    supabase.from("resources").select("id").eq("org_id", orgId),
    supabase.from("resource_transfers").select("id, status, from_org_id, to_org_id").or(`from_org_id.eq.${orgId},to_org_id.eq.${orgId}`).not("status", "in", "(completed,cancelled)"),
    supabase.from("volunteer_opportunities").select("id").eq("org_id", orgId),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "published").gte("ends_at", new Date().toISOString()),
    supabase.from("verification_requests").select("status, decision_note").eq("org_id", orgId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.rpc("org_impact_summary", { p_org: orgId }),
    org.status === "approved" && isCoord ? recommendResourcesForOrg(orgId, 3) : Promise.resolve([]),
  ]);

  const resourceIds = (myListings.data ?? []).map((r) => r.id);
  const oppIds = (opps.data ?? []).map((o) => o.id);
  const [pendingRequests, pendingApps, unverifiedHours] = await Promise.all([
    resourceIds.length ? supabase.from("resource_requests").select("id", { count: "exact", head: true }).in("resource_id", resourceIds).eq("status", "pending") : Promise.resolve({ count: 0 }),
    oppIds.length ? supabase.from("volunteer_applications").select("id", { count: "exact", head: true }).in("opportunity_id", oppIds).eq("status", "pending") : Promise.resolve({ count: 0 }),
    supabase.from("volunteer_hours").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "recorded"),
  ]);

  const tasks = [
    { n: pendingRequests.count ?? 0, label: "resource requests to review", href: `/dashboard/org/${orgId}/resources`, icon: Inbox },
    { n: pendingApps.count ?? 0, label: "volunteer applications to review", href: `/dashboard/org/${orgId}/volunteers`, icon: Users },
    { n: unverifiedHours.count ?? 0, label: "volunteer hour records to verify", href: `/dashboard/org/${orgId}/volunteers`, icon: CheckCircle2 },
    { n: (transfers.data ?? []).length, label: "transfers in progress", href: `/dashboard/org/${orgId}/transfers`, icon: Truck },
  ].filter((t) => t.n > 0);

  type Impact = { metric: string; verification: string; unit: string; total: number };
  const verifiedImpact = ((impact.data ?? []) as Impact[]).filter((r) => r.verification === "verified" && r.metric !== "donation_processed");

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-8">
        {notice === "insufficient-role" ? <FormMessage tone="error">Your role in this organization doesn&apos;t include that section. Ask an admin if you need access.</FormMessage> : null}
        {org.status === "pending" ? (
          <div className="rounded-[var(--radius-lg)] border border-warn/30 bg-warn-wash p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-warn">
              <AlertCircle className="h-5 w-5" aria-hidden="true" />
              {verification.data ? "Under review" : "Submit for review to go live"}
            </h2>
            <p className="mt-2 text-ink-soft">
              {verification.data
                ? `Status: ${verification.data.status.replace("_", " ")}. ${verification.data.decision_note ?? "We'll notify you when there's an update."}`
                : "Your organization is private until our team reviews it. Set up your profile and invite your team in the meantime."}
            </p>
            {!verification.data && roleAtLeast(role, "admin") ? (
              <LinkButton href={`/dashboard/org/${orgId}/verification`} className="mt-4">
                Submit for review
              </LinkButton>
            ) : null}
          </div>
        ) : null}
        {org.status === "suspended" || org.status === "rejected" ? (
          <FormMessage tone="error">
            This organization is {org.status}. It isn&apos;t visible publicly and can&apos;t publish. Contact support if you think this is a mistake.
          </FormMessage>
        ) : null}

        <section aria-labelledby="todo">
          <h2 id="todo" className="text-2xl font-semibold">
            Needs attention
          </h2>
          {tasks.length ? (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {tasks.map((t) => (
                <li key={t.label}>
                  <Link href={t.href} className="flex items-center gap-4 rounded-[var(--radius-md)] border border-line bg-surface p-4 hover:border-ink/40">
                    <t.icon className="h-6 w-6 text-teal" aria-hidden="true" />
                    <span>
                      <span className="font-display text-2xl font-bold">{t.n}</span> <span className="text-ink-soft">{t.label}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-ink-muted">Nothing waiting on you right now.</p>
          )}
        </section>

        {isCoord ? (
          <section aria-labelledby="quick">
            <h2 id="quick" className="text-2xl font-semibold">
              Create
            </h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <LinkButton href={`/dashboard/org/${orgId}/resources/new`} variant="secondary">
                <Package className="h-4 w-4" aria-hidden="true" /> Resource listing
              </LinkButton>
              <LinkButton href={`/dashboard/org/${orgId}/volunteers/new`} variant="secondary">
                <Users className="h-4 w-4" aria-hidden="true" /> Volunteer opportunity
              </LinkButton>
              <LinkButton href={`/dashboard/org/${orgId}/events/new`} variant="secondary">
                <CalendarDays className="h-4 w-4" aria-hidden="true" /> Event
              </LinkButton>
            </div>
          </section>
        ) : null}

        {matches.length ? (
          <section aria-labelledby="matches">
            <h2 id="matches" className="text-2xl font-semibold">
              Resources that may fit your work
            </h2>
            <ul className="mt-4 space-y-3">
              {matches.map((m) => (
                <li key={m.resource.id} className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
                  <Link href={`/resources/${m.resource.id}`} className="font-semibold hover:underline">
                    {m.resource.title}
                  </Link>
                  <p className="text-sm text-ink-muted">
                    {formatNumber(m.resource.quantity_available, 2)} {m.resource.unit} available
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {m.reasons.map((r) => (
                      <li key={r}>
                        <Badge>{r}</Badge>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <aside className="space-y-6">
        <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
          <h2 className="text-lg font-semibold">At a glance</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-ink-muted">Listings</dt>
              <dd className="font-display text-2xl font-bold">{resourceIds.length}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-muted">Opportunities</dt>
              <dd className="font-display text-2xl font-bold">{oppIds.length}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-muted">Upcoming events</dt>
              <dd className="font-display text-2xl font-bold">{events.count ?? 0}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-muted">Open transfers</dt>
              <dd className="font-display text-2xl font-bold">{(transfers.data ?? []).length}</dd>
            </div>
          </dl>
        </section>
        <section className="rounded-[var(--radius-lg)] bg-ink p-6 text-white">
          <h2 className="text-lg font-semibold">Verified impact</h2>
          {verifiedImpact.length ? (
            <dl className="mt-4 space-y-3">
              {verifiedImpact.map((r) => (
                <div key={`${r.metric}-${r.unit}`}>
                  <dt className="text-sm text-white/65">{IMPACT_METRIC_LABEL[r.metric]?.label ?? r.metric}</dt>
                  <dd className="font-display text-2xl font-bold text-marigold">
                    {formatNumber(r.total, 1)} <span className="text-base font-normal text-white/70">{r.unit}</span>
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-2 text-white/70">Complete a transfer, verify volunteer hours or check in event attendees to start your record.</p>
          )}
          <Link href={`/dashboard/org/${orgId}/impact`} className="mt-4 inline-block text-sm font-semibold underline">
            Impact report
          </Link>
        </section>
      </aside>
    </div>
  );
}
