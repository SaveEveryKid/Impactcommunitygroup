import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { CardGrid, OrgCardView, Pagination } from "@/components/cards";
import { FilterBar, ResultCount } from "@/components/filter-bar";
import { LinkButton } from "@/components/ui/button";
import { Container, EmptyState, NotConnectedNotice, PageHeader } from "@/components/ui/misc";
import { ORG_TYPES, ORG_TYPE_LABEL, PILLARS, PILLAR_META } from "@/lib/constants";
import { listOrganizations } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Organization directory",
  description: "Find approved nonprofits, churches, small businesses and community groups by cause, location and well-being area.",
  alternates: { canonical: "/organizations" },
};

type SP = { q?: string; pillar?: string; type?: string; city?: string; page?: string };

export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const pillar = PILLARS.includes(sp.pillar as never) ? sp.pillar : undefined;
  const type = ORG_TYPES.includes(sp.type as never) ? sp.type : undefined;
  const result = await listOrganizations({ q: sp.q, pillar, type, city: sp.city, page: Number(sp.page) || 1 });

  return (
    <>
      <PageHeader
        title="Organization directory"
        lede="Every organization listed here was reviewed by a person on our team before going public."
        actions={<LinkButton href="/signup?type=organization" variant="secondary">List your organization</LinkButton>}
      >
        <FilterBar
          action="/organizations"
          q={sp.q}
          qLabel="Name or cause"
          selects={[
            { name: "pillar", label: "Well-being area", value: pillar, options: PILLARS.map((p) => ({ value: p, label: PILLAR_META[p].label })) },
            { name: "type", label: "Type", value: type, options: ORG_TYPES.map((t) => ({ value: t, label: ORG_TYPE_LABEL[t] })) },
          ]}
          extra={
            <div className="flex flex-col gap-1.5 lg:w-44">
              <label htmlFor="filter-city" className="text-sm font-semibold">
                City
              </label>
              <input
                id="filter-city"
                name="city"
                defaultValue={sp.city}
                className="h-12 rounded-[10px] border border-line-strong bg-surface px-3 text-base focus:border-teal focus:outline-none focus:ring-3 focus:ring-teal/20"
              />
            </div>
          }
        />
      </PageHeader>
      <Container className="py-10">
        {!result.connected ? (
          <NotConnectedNotice />
        ) : result.rows.length ? (
          <>
            <ResultCount total={result.total} noun={["organization", "organizations"]} />
            <CardGrid>
              {result.rows.map((o) => (
                <OrgCardView key={o.id} org={o} />
              ))}
            </CardGrid>
            <Pagination page={result.page} pageCount={result.pageCount} basePath="/organizations" params={{ q: sp.q, pillar, type, city: sp.city }} />
          </>
        ) : (
          <EmptyState icon={Building2} title="No organizations match those filters" action={<LinkButton href="/organizations" variant="secondary">Clear filters</LinkButton>}>
            Try a broader search, or a different well-being area.
          </EmptyState>
        )}
      </Container>
    </>
  );
}
