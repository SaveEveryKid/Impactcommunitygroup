import type { Metadata } from "next";
import { CalendarHeart } from "lucide-react";
import { CardGrid, EventCardView, Pagination } from "@/components/cards";
import { FilterBar, ResultCount } from "@/components/filter-bar";
import { Container, EmptyState, NotConnectedNotice, PageHeader } from "@/components/ui/misc";
import { EVENT_TYPES, EVENT_TYPE_LABEL, PILLARS, PILLAR_META } from "@/lib/constants";
import { listEvents } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Community events",
  description: "Food drives, workshops, community meals, fundraisers and wellness events hosted by local organizations.",
  alternates: { canonical: "/events" },
};

type SP = { q?: string; pillar?: string; type?: string; from?: string; page?: string };

export default async function EventsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const pillar = PILLARS.includes(sp.pillar as never) ? sp.pillar : undefined;
  const type = EVENT_TYPES.includes(sp.type as never) ? sp.type : undefined;
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? new Date(`${sp.from}T00:00:00`).toISOString() : undefined;
  const result = await listEvents({ q: sp.q, pillar, type, from, page: Number(sp.page) || 1 });
  return (
    <>
      <PageHeader title="Community events" lede="Show up, pitch in, meet your neighbors. Registration is free unless an event says otherwise.">
        <FilterBar
          action="/events"
          q={sp.q}
          selects={[
            { name: "type", label: "Kind of event", value: type, options: EVENT_TYPES.map((t) => ({ value: t, label: EVENT_TYPE_LABEL[t] })) },
            { name: "pillar", label: "Well-being area", value: pillar, options: PILLARS.map((p) => ({ value: p, label: PILLAR_META[p].label })) },
          ]}
          extra={
            <div className="flex flex-col gap-1.5 lg:w-44">
              <label htmlFor="filter-from" className="text-sm font-semibold">
                On or after
              </label>
              <input
                id="filter-from"
                type="date"
                name="from"
                defaultValue={sp.from}
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
            <ResultCount total={result.total} noun={["event", "events"]} />
            <CardGrid>
              {result.rows.map((e) => (
                <EventCardView key={e.id} event={e} />
              ))}
            </CardGrid>
            <Pagination page={result.page} pageCount={result.pageCount} basePath="/events" params={{ q: sp.q, pillar, type, from: sp.from }} />
          </>
        ) : (
          <EmptyState icon={CalendarHeart} title="No events match those filters">
            Try a different date or kind of event. Organizations add new events every week.
          </EmptyState>
        )}
      </Container>
    </>
  );
}
