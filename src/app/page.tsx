import Link from "next/link";
import { ArrowUpRight, Building2, CalendarHeart, HandHeart, Store } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Container, EmptyState, SectionHeading } from "@/components/ui/misc";
import { CardGrid, EventCardView, OpportunityCardView, OrgCardView, ResourceCardView } from "@/components/cards";
import { ImpactStrip } from "@/components/impact-strip";
import { PILLARS, PILLAR_META } from "@/lib/constants";
import { getPublicImpact, listEvents, listOpportunities, listOrganizations, listResources } from "@/lib/queries";
import { brandName, siteUrl } from "@/lib/env";

export const revalidate = 120;

const LIFECYCLE = [
  { title: "Listed", body: "A food pantry posts 200 lbs of surplus vegetables, use by Friday." },
  { title: "Requested", body: "A family shelter nearby asks for 120 lbs." },
  { title: "Reserved", body: "The pantry approves. That 120 lbs is now held only for the shelter." },
  { title: "Picked up", body: "A volunteer collects it. The pickup address was shared only with them." },
  { title: "Confirmed", body: "The shelter confirms delivery. It counts as verified impact." },
];

export default async function HomePage() {
  const [orgs, events, opps, resources, impact] = await Promise.all([
    listOrganizations({ page: 1, featured: true }).catch(() => null),
    listEvents({ limit: 3 }).catch(() => null),
    listOpportunities({ limit: 3 }).catch(() => null),
    listResources({ limit: 3 }).catch(() => null),
    getPublicImpact().catch(() => null),
  ]);

  const featured = orgs?.rows.slice(0, 3) ?? [];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: brandName,
    url: siteUrl,
    description: "Community collaboration network for whole-person well-being.",
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <Container className="grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
          <div>
            <h1 className="max-w-[16ch] text-[2.6rem] font-bold leading-[1.04] sm:text-6xl lg:text-[4.4rem]">
              Help gets further when it&apos;s connected.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink-soft sm:text-xl">
              {brandName} links the people who want to help with the nonprofits, churches, businesses and resources that make helping
              possible, so surplus reaches need and volunteers reach the places that need them.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <LinkButton href="/volunteer" size="lg">
                Find a way to volunteer
              </LinkButton>
              <LinkButton href="/signup?type=organization" size="lg" variant="secondary">
                Register your organization
              </LinkButton>
            </div>
            <p className="mt-5 text-[0.95rem] text-ink-muted">Free for individuals and community organizations.</p>
          </div>

          <figure className="rounded-[28px] bg-ink p-6 text-white shadow-[var(--shadow-raised)] sm:p-8">
            <figcaption className="flex items-baseline justify-between gap-4">
              <span className="font-display text-xl font-semibold">How a surplus becomes a meal</span>
              <span className="text-sm text-white/60">Example</span>
            </figcaption>
            <ol className="relative mt-6 space-y-5 before:absolute before:bottom-3 before:left-[15px] before:top-3 before:w-px before:bg-white/20">
              {LIFECYCLE.map((s, i) => (
                <li key={s.title} className="lifecycle-step relative flex gap-4">
                  <span
                    className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold"
                    style={{ background: i === LIFECYCLE.length - 1 ? "var(--marigold)" : "var(--teal)", color: i === LIFECYCLE.length - 1 ? "var(--ink)" : "#fff" }}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-semibold">{s.title}</p>
                    <p className="text-[0.95rem] text-white/75">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </figure>
        </Container>
      </section>

      {/* Pillars */}
      <section aria-labelledby="pillars" className="py-16 sm:py-24">
        <Container>
          <SectionHeading
            id="pillars"
            title="Whole people, whole communities"
            lede="Every organization and opportunity is tagged with the parts of life it strengthens, so you can find the work that fits you."
          />
          <ul className="grid gap-px overflow-hidden rounded-[var(--radius-lg)] border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
            {PILLARS.map((p) => {
              const m = PILLAR_META[p];
              const Icon = m.icon;
              return (
                <li key={p} className="bg-surface">
                  <Link href={`/organizations?pillar=${p}`} className="flex h-full flex-col gap-3 p-6 hover:bg-paper-raised">
                    <span className="grid h-11 w-11 place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${m.color} 14%, white)`, color: m.color }}>
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="font-display text-lg font-semibold">{m.label}</span>
                    <span className="text-[0.95rem] text-ink-soft">{m.blurb}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Container>
      </section>

      {/* Who it's for */}
      <section aria-labelledby="how" className="border-y border-line bg-paper-raised py-16 sm:py-24">
        <Container>
          <SectionHeading
            id="how"
            title="One network, three ways in"
            action={
              <Link href="/how-it-works" className="inline-flex items-center gap-1 font-semibold text-teal-strong hover:underline">
                See how it works <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            }
          />
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Building2,
                title: "Nonprofits and churches",
                body: "Share surplus, request what you're short on, recruit and schedule volunteers, run events and report verified impact to funders.",
                href: "/signup?type=organization",
                cta: "Register your organization",
              },
              {
                icon: HandHeart,
                title: "Volunteers",
                body: "Find opportunities by cause, schedule and distance. Your hours are verified by the organization, so your service record is real.",
                href: "/signup",
                cta: "Create a volunteer profile",
              },
              {
                icon: Store,
                title: "Businesses and donors",
                body: "Donate goods and services, sponsor community programs, or give directly to verified organizations through secure checkout.",
                href: "/support",
                cta: "Ways to support",
              },
            ].map((c) => (
              <div key={c.title} className="flex flex-col">
                <c.icon className="h-8 w-8 text-teal" aria-hidden="true" />
                <h3 className="mt-4 text-2xl font-semibold">{c.title}</h3>
                <p className="mt-3 flex-1 text-ink-soft">{c.body}</p>
                <Link href={c.href} className="mt-5 font-semibold text-teal-strong underline-offset-4 hover:underline">
                  {c.cta}
                </Link>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* Live listings */}
      <section aria-labelledby="happening" className="py-16 sm:py-24">
        <Container className="space-y-16">
          <div>
            <SectionHeading
              id="happening"
              title="Coming up"
              action={<Link href="/events" className="font-semibold text-teal-strong hover:underline">All events</Link>}
            />
            {events?.rows.length ? (
              <CardGrid>
                {events.rows.map((e) => (
                  <EventCardView key={e.id} event={e} />
                ))}
              </CardGrid>
            ) : (
              <EmptyState icon={CalendarHeart} title="No public events scheduled yet">
                When approved organizations publish food drives, workshops and community meals, they&apos;ll appear here.
              </EmptyState>
            )}
          </div>

          <div>
            <SectionHeading
              title="Volunteers needed"
              action={<Link href="/volunteer" className="font-semibold text-teal-strong hover:underline">All opportunities</Link>}
            />
            {opps?.rows.length ? (
              <CardGrid>
                {opps.rows.map((o) => (
                  <OpportunityCardView key={o.id} opp={o} />
                ))}
              </CardGrid>
            ) : (
              <EmptyState icon={HandHeart} title="No open volunteer roles yet" action={<LinkButton href="/signup" variant="secondary">Create a volunteer profile</LinkButton>}>
                Set up your profile now and we&apos;ll show you matching opportunities as organizations post them.
              </EmptyState>
            )}
          </div>

          <div>
            <SectionHeading
              title="On the resource exchange"
              lede="Surplus offered and needs posted by approved organizations."
              action={<Link href="/resources" className="font-semibold text-teal-strong hover:underline">Browse the exchange</Link>}
            />
            {resources?.rows.length ? (
              <CardGrid>
                {resources.rows.map((r) => (
                  <ResourceCardView key={r.id} resource={r} />
                ))}
              </CardGrid>
            ) : (
              <EmptyState icon={Building2} title="The exchange is ready for its first listing">
                Approved organizations can list surplus food, clothing, furniture, equipment and volunteer labor, or post what they need.
              </EmptyState>
            )}
          </div>

          {featured.length ? (
            <div>
              <SectionHeading
                title="Featured organizations"
                action={<Link href="/organizations" className="font-semibold text-teal-strong hover:underline">Directory</Link>}
              />
              <CardGrid>
                {featured.map((o) => (
                  <OrgCardView key={o.id} org={o} />
                ))}
              </CardGrid>
            </div>
          ) : null}
        </Container>
      </section>

      {/* Impact */}
      <section aria-labelledby="impact" className="bg-ink py-16 text-white sm:py-24">
        <Container>
          <div className="max-w-2xl">
            <h2 id="impact" className="text-3xl font-semibold sm:text-[2.4rem]">
              Impact you can check
            </h2>
            <p className="mt-3 text-lg text-white/75">
              These numbers count only activity confirmed inside the platform: transfers the receiver confirmed, hours a coordinator verified,
              attendees checked in at the door.
            </p>
          </div>
          <ImpactStrip rows={impact?.rows ?? []} connected={Boolean(impact?.connected)} />
          <Link href="/impact" className="mt-10 inline-flex font-semibold text-white underline underline-offset-4">
            How we measure impact
          </Link>
        </Container>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-24">
        <Container className="grid gap-6 md:grid-cols-2">
          <div className="rounded-[var(--radius-lg)] bg-teal p-8 text-white sm:p-10">
            <h2 className="text-3xl font-semibold">Bring your organization</h2>
            <p className="mt-3 max-w-md text-white/85">
              Registration takes about ten minutes. A person on our team reviews every organization before it goes public.
            </p>
            <LinkButton href="/signup?type=organization" variant="inverse" size="lg" className="mt-6">
              Register your organization
            </LinkButton>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-8 sm:p-10">
            <h2 className="text-3xl font-semibold">Sponsor the network</h2>
            <p className="mt-3 max-w-md text-ink-soft">
              Businesses and funders keep the platform free for the organizations using it. See where support goes and what it makes possible.
            </p>
            <LinkButton href="/support" variant="secondary" size="lg" className="mt-6">
              Ways to support
            </LinkButton>
          </div>
        </Container>
      </section>
    </>
  );
}
