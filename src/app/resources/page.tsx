import type { Metadata } from "next";
import { Package } from "lucide-react";
import { CardGrid, Pagination, ResourceCardView } from "@/components/cards";
import { FilterBar, ResultCount } from "@/components/filter-bar";
import { LinkButton } from "@/components/ui/button";
import { Container, EmptyState, NotConnectedNotice, PageHeader } from "@/components/ui/misc";
import { RESOURCE_CATEGORIES, RESOURCE_CATEGORY_LABEL } from "@/lib/constants";
import { listResources } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Community resource exchange",
  description: "Approved organizations share surplus food, clothing, furniture, supplies and services, and post what they need.",
  alternates: { canonical: "/resources" },
};

type SP = { q?: string; kind?: string; category?: string; page?: string };

export default async function ResourcesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const category = RESOURCE_CATEGORIES.includes(sp.category as never) ? sp.category : undefined;
  const kind = sp.kind === "offer" || sp.kind === "need" ? sp.kind : undefined;
  const result = await listResources({ q: sp.q, kind, category, page: Number(sp.page) || 1 });
  return (
    <>
      <PageHeader
        title="Resource exchange"
        lede="Organizations list what they can give and what they need. Approved organizations can request listings; pickup details are shared only after approval."
        actions={<LinkButton href="/dashboard" variant="secondary">List a resource</LinkButton>}
      >
        <FilterBar
          action="/resources"
          q={sp.q}
          selects={[
            { name: "kind", label: "Show", value: kind, options: [{ value: "offer", label: "Available to claim" }, { value: "need", label: "Needed by organizations" }] },
            { name: "category", label: "Category", value: category, options: RESOURCE_CATEGORIES.map((c) => ({ value: c, label: RESOURCE_CATEGORY_LABEL[c] })) },
          ]}
        />
      </PageHeader>
      <Container className="py-10">
        {!result.connected ? (
          <NotConnectedNotice />
        ) : result.rows.length ? (
          <>
            <ResultCount total={result.total} noun={["listing", "listings"]} />
            <CardGrid>
              {result.rows.map((r) => (
                <ResourceCardView key={r.id} resource={r} />
              ))}
            </CardGrid>
            <Pagination page={result.page} pageCount={result.pageCount} basePath="/resources" params={{ q: sp.q, kind, category }} />
          </>
        ) : (
          <EmptyState icon={Package} title="No listings match right now">
            Check back soon, or post what your organization needs so donors and other organizations can find it.
          </EmptyState>
        )}
        <p className="mt-12 max-w-3xl text-sm text-ink-muted">
          Food listings include handling and use-by information supplied by the listing organization. The platform does not inspect or certify food
          safety. Receiving organizations are responsible for following their own food-handling standards.
        </p>
      </Container>
    </>
  );
}
