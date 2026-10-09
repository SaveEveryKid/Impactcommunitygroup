import type { Metadata } from "next";
import { HandHeart } from "lucide-react";
import { CardGrid, OpportunityCardView, Pagination } from "@/components/cards";
import { FilterBar, ResultCount } from "@/components/filter-bar";
import { LinkButton } from "@/components/ui/button";
import { Container, EmptyState, NotConnectedNotice, PageHeader } from "@/components/ui/misc";
import { PILLARS, PILLAR_META } from "@/lib/constants";
import { listOpportunities } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Volunteer opportunities",
  description: "Find volunteer roles with local nonprofits, churches and community groups by cause, schedule and location.",
  alternates: { canonical: "/volunteer" },
};

type SP = { q?: string; pillar?: string; virtual?: string; page?: string };

export default async function VolunteerPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const pillar = PILLARS.includes(sp.pillar as never) ? sp.pillar : undefined;
  const virtual = sp.virtual === "remote";
  const result = await listOpportunities({ q: sp.q, pillar, virtual, page: Number(sp.page) || 1 });
  return (
    <>
      <PageHeader
        title="Volunteer opportunities"
        lede="Choose something that fits your week. Organizations verify your hours, so your service record stays accurate."
      >
        <FilterBar
          action="/volunteer"
          q={sp.q}
          qLabel="Skill, cause or keyword"
          selects={[
            { name: "pillar", label: "Well-being area", value: pillar, options: PILLARS.map((p) => ({ value: p, label: PILLAR_META[p].label })) },
            { name: "virtual", label: "Where", value: sp.virtual, options: [{ value: "remote", label: "Remote only" }] },
          ]}
        />
      </PageHeader>
      <Container className="py-10">
        {!result.connected ? (
          <NotConnectedNotice />
        ) : result.rows.length ? (
          <>
            <ResultCount total={result.total} noun={["opportunity", "opportunities"]} />
            <CardGrid>
              {result.rows.map((o) => (
                <OpportunityCardView key={o.id} opp={o} />
              ))}
            </CardGrid>
            <Pagination page={result.page} pageCount={result.pageCount} basePath="/volunteer" params={{ q: sp.q, pillar, virtual: sp.virtual }} />
          </>
        ) : (
          <EmptyState icon={HandHeart} title="No opportunities match right now" action={<LinkButton href="/dashboard/volunteer/profile" variant="secondary">Set your volunteer preferences</LinkButton>}>
            Save your interests and availability, and matching opportunities will show up on your dashboard.
          </EmptyState>
        )}
      </Container>
    </>
  );
}
