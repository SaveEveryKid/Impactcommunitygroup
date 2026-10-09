import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Globe, Mail, MapPin, Phone, MessageSquare } from "lucide-react";
import { CardGrid, EventCardView, OpportunityCardView, ResourceCardView } from "@/components/cards";
import { ReportButton } from "@/components/report-button";
import { Button, LinkButton } from "@/components/ui/button";
import { Badge, Container, PillarTag, VerificationBadge } from "@/components/ui/misc";
import { toggleFollow } from "@/app/actions/social";
import { IMPACT_METRIC_LABEL, ORG_TYPE_LABEL, type OrgType, type Pillar } from "@/lib/constants";
import { getOrganizationBySlug, listEvents, listOpportunities, listResources } from "@/lib/queries";
import { getCurrentUser, getSupabase } from "@/lib/supabase/server";
import { formatDate, formatNumber, mediaUrl } from "@/lib/utils";
import { siteUrl } from "@/lib/env";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const org = await getOrganizationBySlug(slug);
  if (!org) return { title: "Organization not found" };
  return {
    title: org.name,
    description: org.mission ?? undefined,
    alternates: { canonical: `/organizations/${org.slug}` },
    openGraph: { title: org.name, description: org.mission ?? undefined, images: org.cover_path ? [mediaUrl(org.cover_path)!] : undefined },
    robots: org.status !== "approved" || org.is_demo ? { index: false } : undefined,
  };
}

export default async function OrganizationProfile({ params }: Params) {
  const { slug } = await params;
  const org = await getOrganizationBySlug(slug);
  if (!org) notFound();

  const supabase = (await getSupabase())!;
  const user = await getCurrentUser();

  const [opps, events, resources, postsRes, partnersRes, impactRes, followRes, memberRes] = await Promise.all([
    listOpportunities({ orgId: org.id, limit: 6 }),
    listEvents({ orgId: org.id, limit: 6 }),
    listResources({ orgId: org.id, limit: 6 }),
    supabase.from("posts").select("id, kind, title, body, created_at").eq("org_id", org.id).eq("status", "published").order("created_at", { ascending: false }).limit(5),
    supabase
      .from("partnerships")
      .select("id, requester:requester_org_id(slug, name), target:target_org_id(slug, name)")
      .eq("status", "accepted")
      .or(`requester_org_id.eq.${org.id},target_org_id.eq.${org.id}`)
      .limit(12),
    supabase.rpc("org_impact_summary", { p_org: org.id }),
    user ? supabase.from("follows").select("org_id").eq("user_id", user.id).eq("org_id", org.id).maybeSingle() : Promise.resolve({ data: null }),
    user ? supabase.from("organization_members").select("role").eq("user_id", user.id).eq("org_id", org.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const following = Boolean(followRes.data);
  const myRole = (memberRes.data as { role?: string } | null)?.role;
  const cover = mediaUrl(org.cover_path);
  const logo = mediaUrl(org.logo_path);
  const social = (org.social_links ?? {}) as Record<string, string>;
  type Partner = { id: string; requester: { slug: string; name: string }; target: { slug: string; name: string } };
  const partners = ((partnersRes.data ?? []) as unknown as Partner[]).map((p) => (p.requester.slug === org.slug ? p.target : p.requester));
  type Impact = { metric: string; verification: string; unit: string; total: number };
  const impact = ((impactRes.data ?? []) as Impact[]).filter((r) => r.verification === "verified" && r.metric !== "donation_processed");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": org.org_type === "faith_based" ? "Church" : org.org_type === "small_business" ? "LocalBusiness" : "NGO",
    name: org.name,
    description: org.mission,
    url: `${siteUrl}/organizations/${org.slug}`,
    sameAs: org.website_url ? [org.website_url] : undefined,
    address: org.city ? { "@type": "PostalAddress", addressLocality: org.city, addressRegion: org.region } : undefined,
  };

  return (
    <>
      {org.status === "approved" && !org.is_demo ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      ) : null}
      {org.status !== "approved" ? (
        <div className="bg-warn-wash text-warn">
          <Container className="py-3 text-[0.95rem] font-semibold">
            Only your team can see this page. It goes public once our review team approves the organization.
          </Container>
        </div>
      ) : null}

      <header className="border-b border-line bg-paper-raised">
        <div className="relative h-40 bg-ink sm:h-56">
          {cover ? <Image src={cover} alt="" fill priority sizes="100vw" className="object-cover" /> : null}
        </div>
        <Container className="pb-8">
          <div className="-mt-12 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-[22px] border-4 border-paper-raised bg-surface font-display text-4xl font-bold">
                {logo ? <Image src={logo} alt={`${org.name} logo`} width={96} height={96} className="h-full w-full object-cover" /> : org.name.slice(0, 1)}
              </div>
              <div className="pb-1">
                <h1 className="text-3xl font-bold sm:text-4xl">{org.name}</h1>
                <p className="text-ink-muted">
                  {ORG_TYPE_LABEL[org.org_type as OrgType]}
                  {org.city ? `, ${org.city}, ${org.region ?? ""}` : ""}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {myRole ? (
                <LinkButton href={`/dashboard/org/${org.id}`} variant="secondary">
                  Manage organization
                </LinkButton>
              ) : null}
              {org.status === "approved" ? (
                <>
                  <form action={toggleFollow}>
                    <input type="hidden" name="org_id" value={org.id} />
                    <input type="hidden" name="slug" value={org.slug} />
                    <input type="hidden" name="following" value={String(following)} />
                    <Button type="submit" variant={following ? "secondary" : "primary"} aria-pressed={following}>
                      {following ? "Following" : "Follow updates"}
                    </Button>
                  </form>
                  <LinkButton href={`/inbox/new?to_org=${org.id}`} variant="secondary">
                    <MessageSquare className="h-4 w-4" aria-hidden="true" />
                    Message
                  </LinkButton>
                </>
              ) : null}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <VerificationBadge level={org.verification_level} />
            {org.is_demo ? <Badge tone="marigold">Demo organization</Badge> : null}
            {(org.pillars as Pillar[]).map((p) => (
              <PillarTag key={p} pillar={p} size="md" />
            ))}
          </div>
        </Container>
      </header>

      <Container className="grid gap-12 py-12 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-14">
          <section aria-labelledby="about">
            <h2 id="about" className="text-2xl font-semibold">
              Mission
            </h2>
            {org.mission ? <p className="mt-3 text-xl leading-relaxed text-ink">{org.mission}</p> : null}
            {org.description ? <div className="mt-4 whitespace-pre-line text-ink-soft">{org.description}</div> : null}
            {org.service_categories?.length ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {(org.service_categories as string[]).map((c) => (
                  <Badge key={c}>{c}</Badge>
                ))}
              </div>
            ) : null}
          </section>

          {opps.rows.length ? (
            <section aria-labelledby="opps">
              <h2 id="opps" className="mb-5 text-2xl font-semibold">
                Volunteer with us
              </h2>
              <CardGrid>{opps.rows.map((o) => <OpportunityCardView key={o.id} opp={o} />)}</CardGrid>
            </section>
          ) : null}

          {events.rows.length ? (
            <section aria-labelledby="events">
              <h2 id="events" className="mb-5 text-2xl font-semibold">
                Upcoming events
              </h2>
              <CardGrid>{events.rows.map((e) => <EventCardView key={e.id} event={e} />)}</CardGrid>
            </section>
          ) : null}

          {resources.rows.length ? (
            <section aria-labelledby="resources">
              <h2 id="resources" className="mb-5 text-2xl font-semibold">
                On the resource exchange
              </h2>
              <CardGrid>{resources.rows.map((r) => <ResourceCardView key={r.id} resource={r} />)}</CardGrid>
            </section>
          ) : null}

          <section aria-labelledby="updates">
            <h2 id="updates" className="mb-5 text-2xl font-semibold">
              Updates
            </h2>
            {postsRes.data?.length ? (
              <ul className="divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-surface">
                {postsRes.data.map((p) => (
                  <li key={p.id} className="p-5">
                    <p className="text-sm text-ink-muted">{formatDate(p.created_at)}</p>
                    {p.title ? <h3 className="mt-1 text-lg font-semibold">{p.title}</h3> : null}
                    <p className="mt-1 line-clamp-4 whitespace-pre-line text-ink-soft">{p.body}</p>
                    <Link href={`/feed/${p.id}`} className="mt-2 inline-block font-semibold text-teal-strong hover:underline">
                      Read and comment
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-muted">No updates posted yet.</p>
            )}
          </section>
        </div>

        <aside className="space-y-8">
          <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
            <h2 className="text-lg font-semibold">Contact</h2>
            <ul className="mt-4 space-y-3 text-[0.97rem]">
              {org.service_area ? (
                <li className="flex gap-3">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" aria-hidden="true" />
                  <span>Serves {org.service_area}</span>
                </li>
              ) : null}
              {org.website_url ? (
                <li className="flex gap-3">
                  <Globe className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" aria-hidden="true" />
                  <a href={org.website_url} rel="noopener noreferrer nofollow" target="_blank" className="break-all text-teal-strong underline">
                    {org.website_url.replace(/^https?:\/\//, "")}
                  </a>
                </li>
              ) : null}
              {org.public_email ? (
                <li className="flex gap-3">
                  <Mail className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" aria-hidden="true" />
                  <a href={`mailto:${org.public_email}`} className="break-all text-teal-strong underline">
                    {org.public_email}
                  </a>
                </li>
              ) : null}
              {org.public_phone ? (
                <li className="flex gap-3">
                  <Phone className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" aria-hidden="true" />
                  <a href={`tel:${org.public_phone}`} className="text-teal-strong underline">
                    {org.public_phone}
                  </a>
                </li>
              ) : null}
              {Object.entries(social)
                .filter(([, v]) => /^https:\/\//.test(v))
                .map(([k, v]) => (
                  <li key={k}>
                    <a href={v} rel="noopener noreferrer nofollow" target="_blank" className="capitalize text-teal-strong underline">
                      {k}
                    </a>
                  </li>
                ))}
            </ul>
          </section>

          <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
            <h2 className="text-lg font-semibold">Verified impact on the network</h2>
            {impact.length ? (
              <dl className="mt-4 space-y-3">
                {impact.map((r) => (
                  <div key={`${r.metric}-${r.unit}`}>
                    <dt className="text-sm text-ink-muted">{IMPACT_METRIC_LABEL[r.metric]?.label ?? r.metric}</dt>
                    <dd className="font-display text-2xl font-bold">
                      {formatNumber(r.total, 1)} <span className="text-base font-normal text-ink-muted">{r.unit}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-3 text-[0.95rem] text-ink-muted">No confirmed activity recorded yet.</p>
            )}
          </section>

          {partners.length ? (
            <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
              <h2 className="text-lg font-semibold">Partner organizations</h2>
              <ul className="mt-3 space-y-2">
                {partners.map((p) => (
                  <li key={p.slug}>
                    <Link href={`/organizations/${p.slug}`} className="font-semibold text-teal-strong hover:underline">
                      {p.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="space-y-2 text-sm text-ink-muted">
            {org.approved_at ? <p>On the network since {formatDate(org.approved_at)}.</p> : null}
            {org.verification_level !== "tax_exempt_verified" ? (
              <p>Tax-exempt status has not been checked by our team. Confirm with the organization before claiming a deduction.</p>
            ) : null}
            {user ? <ReportButton targetType="organization" targetId={org.id} label="Report this organization" /> : null}
          </div>
        </aside>
      </Container>
    </>
  );
}
