import type { Metadata } from "next";
import Link from "next/link";
import { Handshake } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Container, EmptyState, PageHeader } from "@/components/ui/misc";
import { getSponsors } from "@/lib/content";
import { getSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Partners and sponsors",
  description: "The sponsors who keep the network free, and the organizations partnering with one another on it.",
  alternates: { canonical: "/partners" },
};

export default async function PartnersPage() {
  const sponsors = await getSponsors();
  const supabase = await getSupabase();
  type P = { id: string; requester: { slug: string; name: string }; target: { slug: string; name: string } };
  const { data } = supabase
    ? await supabase
        .from("partnerships")
        .select("id, requester:requester_org_id(slug, name), target:target_org_id(slug, name)")
        .eq("status", "accepted")
        .eq("is_demo", false)
        .order("decided_at", { ascending: false })
        .limit(30)
    : { data: [] };
  const partnerships = (data ?? []) as unknown as P[];

  return (
    <>
      <PageHeader title="Partners and sponsors" lede="Sponsors keep the platform free for the organizations that use it. Every sponsor listed here is a real, confirmed supporter." />
      <Container className="space-y-16 py-14">
        <section aria-labelledby="sponsors">
          <h2 id="sponsors" className="text-2xl font-semibold">
            Sponsors
          </h2>
          {sponsors.length ? (
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sponsors.map((s) => (
                <li key={s.name} className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
                  {s.tier ? <p className="text-sm font-semibold text-teal-strong">{s.tier}</p> : null}
                  <p className="font-display text-xl font-semibold">
                    {s.url ? (
                      <a href={s.url} rel="noopener noreferrer" target="_blank" className="hover:underline">
                        {s.name}
                      </a>
                    ) : (
                      s.name
                    )}
                  </p>
                  {s.note ? <p className="mt-2 text-ink-soft">{s.note}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-6">
              <EmptyState icon={Handshake} title="Founding sponsor positions are open" action={<LinkButton href="/contact">Talk to us about sponsoring</LinkButton>}>
                Founding sponsors fund verification, moderation and the platform itself, and are recognized here and on the impact report.
              </EmptyState>
            </div>
          )}
        </section>
        <section aria-labelledby="partnerships">
          <h2 id="partnerships" className="text-2xl font-semibold">
            Organizations working together
          </h2>
          <p className="mt-2 text-ink-soft">Partnerships formed on the network, accepted by both organizations.</p>
          {partnerships.length ? (
            <ul className="mt-6 divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-surface">
              {partnerships.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 p-4">
                  <Link href={`/organizations/${p.requester.slug}`} className="font-semibold text-teal-strong hover:underline">
                    {p.requester.name}
                  </Link>
                  <span className="text-ink-muted">and</span>
                  <Link href={`/organizations/${p.target.slug}`} className="font-semibold text-teal-strong hover:underline">
                    {p.target.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-ink-muted">No partnerships yet. Organization admins can propose one from any organization&apos;s page.</p>
          )}
        </section>
      </Container>
    </>
  );
}
