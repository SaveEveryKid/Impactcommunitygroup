import type { Metadata } from "next";
import Link from "next/link";
import { HeartHandshake } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Container, EmptyState, PageHeader } from "@/components/ui/misc";
import { getSupabase } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Support the mission",
  description: "Give to active fundraising campaigns, donate goods through the resource exchange, or sponsor the network.",
  alternates: { canonical: "/support" },
};

export default async function SupportPage() {
  const supabase = await getSupabase();
  const { data } = supabase
    ? await supabase
        .from("fundraising_campaigns")
        .select("id, slug, title, summary, goal_cents, org_id, organizations(name, slug)")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(12)
    : { data: [] };
  type C = { id: string; slug: string; title: string; summary: string | null; goal_cents: number | null; org_id: string | null; organizations: { name: string; slug: string } | null };
  const campaigns = (data ?? []) as unknown as C[];
  const progress = supabase
    ? await Promise.all(campaigns.map(async (c) => (await supabase.rpc("campaign_progress", { p_campaign: c.id })).data?.[0] ?? { raised_cents: 0, donor_count: 0 }))
    : [];

  return (
    <>
      <PageHeader title="Support the mission" lede="There's more than one way to give. Pick the one that fits you." />
      <Container className="space-y-16 py-14">
        <section aria-labelledby="campaigns">
          <h2 id="campaigns" className="text-2xl font-semibold">
            Active campaigns
          </h2>
          {campaigns.length ? (
            <ul className="mt-6 grid gap-4 md:grid-cols-2">
              {campaigns.map((c, i) => {
                const raised = Number(progress[i]?.raised_cents ?? 0);
                const pct = c.goal_cents ? Math.min(100, Math.round((raised / c.goal_cents) * 100)) : null;
                return (
                  <li key={c.id} className="relative flex flex-col rounded-[var(--radius-lg)] border border-line bg-surface p-6">
                    <p className="text-sm font-semibold text-teal-strong">{c.organizations?.name ?? "Platform campaign"}</p>
                    <h3 className="mt-1 text-xl font-semibold">
                      <Link href={`/campaigns/${c.slug}`} className="after:absolute after:inset-0 after:content-['']">
                        {c.title}
                      </Link>
                    </h3>
                    {c.summary ? <p className="mt-2 text-ink-soft">{c.summary}</p> : null}
                    <div className="mt-auto pt-5">
                      <p className="font-semibold">
                        {formatCurrency(raised)} raised{c.goal_cents ? ` of ${formatCurrency(c.goal_cents)}` : ""}
                      </p>
                      {pct !== null ? (
                        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% of goal`}>
                          <div className="h-full rounded-full bg-teal" style={{ width: `${pct}%` }} />
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-6">
              <EmptyState icon={HeartHandshake} title="No campaigns are live right now">
                Campaigns go live only after the organization is verified and its payment account is set up. Check back soon.
              </EmptyState>
            </div>
          )}
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
            <h2 className="text-xl font-semibold">Donate goods or services</h2>
            <p className="mt-2 text-ink-soft">Register your business to list inventory, equipment, space or professional time on the resource exchange.</p>
            <LinkButton href="/signup?type=organization" variant="secondary" className="mt-5">
              Register a business
            </LinkButton>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
            <h2 className="text-xl font-semibold">Give your time</h2>
            <p className="mt-2 text-ink-soft">Volunteer with an organization near you. Many roles take a couple of hours.</p>
            <LinkButton href="/volunteer" variant="secondary" className="mt-5">
              Find opportunities
            </LinkButton>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
            <h2 className="text-xl font-semibold">Sponsor the network</h2>
            <p className="mt-2 text-ink-soft">Fund the platform that serves every organization on it. Sponsors are recognized on our partners page.</p>
            <LinkButton href="/contact" variant="secondary" className="mt-5">
              Talk to us
            </LinkButton>
          </div>
        </section>

        <p className="max-w-3xl text-sm text-ink-muted">
          Payments are processed securely by Stripe. We never see or store your card number. Whether a gift is tax-deductible depends on the
          recipient&apos;s status, which is shown on each campaign; consult your tax advisor.
        </p>
      </Container>
    </>
  );
}
