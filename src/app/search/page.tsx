import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { CardGrid, EventCardView, OpportunityCardView, OrgCardView, ResourceCardView } from "@/components/cards";
import { Container, EmptyState, NotConnectedNotice, PageHeader } from "@/components/ui/misc";
import { listEvents, listOpportunities, listOrganizations, listResources } from "@/lib/queries";

export const metadata: Metadata = { title: "Search", robots: { index: false } };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const term = q.trim();
  const [orgs, opps, events, resources] = term
    ? await Promise.all([
        listOrganizations({ q: term }),
        listOpportunities({ q: term, limit: 6 }),
        listEvents({ q: term, limit: 6 }),
        listResources({ q: term, limit: 6 }),
      ])
    : [null, null, null, null];
  const connected = orgs?.connected ?? true;
  const total = (orgs?.total ?? 0) + (opps?.total ?? 0) + (events?.total ?? 0) + (resources?.total ?? 0);

  const Section = ({ title, href, children, count }: { title: string; href: string; children: React.ReactNode; count: number }) =>
    count ? (
      <section className="space-y-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl font-semibold">
            {title} <span className="text-base font-normal text-ink-muted">({count})</span>
          </h2>
          {count > 6 ? (
            <Link href={`${href}?q=${encodeURIComponent(term)}`} className="font-semibold text-teal-strong hover:underline">
              See all
            </Link>
          ) : null}
        </div>
        <CardGrid>{children}</CardGrid>
      </section>
    ) : null;

  return (
    <>
      <PageHeader title="Search">
        <form action="/search" role="search" className="mt-6 flex max-w-2xl gap-2">
          <label htmlFor="q" className="sr-only">
            Search organizations, opportunities, events and resources
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={term}
            placeholder="Food pantry, tutoring, coats…"
            className="h-12 flex-1 rounded-full border border-line-strong bg-surface px-5 text-base focus:border-teal focus:outline-none focus:ring-3 focus:ring-teal/20"
          />
          <button type="submit" className="h-12 rounded-full bg-teal px-6 font-semibold text-white hover:bg-teal-strong">
            Search
          </button>
        </form>
      </PageHeader>
      <Container className="space-y-14 py-10">
        {!connected ? (
          <NotConnectedNotice />
        ) : !term ? (
          <p className="text-ink-muted">Search across organizations, volunteer opportunities, events and the resource exchange.</p>
        ) : total === 0 ? (
          <EmptyState icon={Search} title={`Nothing found for "${term}"`}>
            Try a shorter or more general word.
          </EmptyState>
        ) : (
          <>
            <Section title="Organizations" href="/organizations" count={orgs!.total}>
              {orgs!.rows.slice(0, 6).map((o) => <OrgCardView key={o.id} org={o} />)}
            </Section>
            <Section title="Volunteer opportunities" href="/volunteer" count={opps!.total}>
              {opps!.rows.map((o) => <OpportunityCardView key={o.id} opp={o} />)}
            </Section>
            <Section title="Events" href="/events" count={events!.total}>
              {events!.rows.map((e) => <EventCardView key={e.id} event={e} />)}
            </Section>
            <Section title="Resources" href="/resources" count={resources!.total}>
              {resources!.rows.map((r) => <ResourceCardView key={r.id} resource={r} />)}
            </Section>
          </>
        )}
      </Container>
    </>
  );
}
