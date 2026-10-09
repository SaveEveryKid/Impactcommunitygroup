import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Container, VerificationBadge } from "@/components/ui/misc";
import { FormMessage } from "@/components/ui/field";
import { getCurrentUser, getSupabase } from "@/lib/supabase/server";
import { isStripeConfigured } from "@/lib/stripe";
import { brandName } from "@/lib/env";
import { formatCurrency, formatDate, mediaUrl } from "@/lib/utils";
import { DonateForm } from "./donate-form";

type Params = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.from("fundraising_campaigns").select("*, organizations(id, name, slug, verification_level)").eq("slug", slug).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const c = await load((await params).slug);
  if (!c) return { title: "Campaign not found" };
  return { title: c.title, description: c.summary ?? undefined, alternates: { canonical: `/campaigns/${c.slug}` }, robots: c.is_demo || c.status !== "active" ? { index: false } : undefined };
}

export default async function CampaignPage({ params, searchParams }: Params & { searchParams: Promise<{ cancelled?: string }> }) {
  const { slug } = await params;
  const { cancelled } = await searchParams;
  const c = await load(slug);
  if (!c) notFound();
  const supabase = (await getSupabase())!;
  const user = await getCurrentUser();
  const [{ data: prog }, { data: donors }, { data: canFundraise }] = await Promise.all([
    supabase.rpc("campaign_progress", { p_campaign: c.id }),
    supabase.rpc("campaign_public_donors", { p_campaign: c.id, p_limit: 12 }),
    c.org_id ? supabase.rpc("org_can_fundraise", { p_org: c.org_id }) : Promise.resolve({ data: true }),
  ]);
  const raised = Number(prog?.[0]?.raised_cents ?? 0);
  const pct = c.goal_cents ? Math.min(100, Math.round((raised / c.goal_cents) * 100)) : null;
  const open = c.status === "active" && (!c.ends_at || new Date(c.ends_at) > new Date()) && canFundraise && isStripeConfigured();
  const recipient = c.organizations?.name ?? brandName;
  const taxNote = c.organizations
    ? c.organizations.verification_level === "tax_exempt_verified"
      ? `${recipient}'s tax-exempt status was checked by our team against IRS records. Consult your tax advisor about deductibility.`
      : `${recipient}'s tax-exempt status has not been checked by our team. Don't assume this gift is tax-deductible.`
    : "Contributions to the platform's own campaigns may not be tax-deductible. See the campaign details.";
  return (
    <>
      {c.cover_path ? <div className="relative h-56 bg-ink sm:h-80"><Image src={mediaUrl(c.cover_path)!} alt="" fill priority sizes="100vw" className="object-cover" /></div> : null}
      <Container className="grid gap-12 py-12 lg:grid-cols-[1fr_420px]">
        <article className="min-w-0">
          {c.organizations ? <Link href={`/organizations/${c.organizations.slug}`} className="font-semibold text-teal-strong hover:underline">{recipient}</Link> : <p className="font-semibold text-teal-strong">{brandName}</p>}
          <h1 className="mt-2 text-4xl font-bold sm:text-5xl">{c.title}</h1>
          <div className="mt-4 flex flex-wrap gap-2">
            {c.organizations ? <VerificationBadge level={c.organizations.verification_level} /> : null}
            {c.is_demo ? <Badge tone="marigold">Demo data</Badge> : null}
            {c.status !== "active" ? <Badge>{c.status.replace("_", " ")}</Badge> : null}
          </div>
          {c.summary ? <p className="mt-5 text-xl text-ink-soft">{c.summary}</p> : null}
          <div className="mt-8">
            <p className="font-display text-4xl font-bold">{formatCurrency(raised)}</p>
            <p className="text-ink-muted">raised{c.goal_cents ? ` of ${formatCurrency(c.goal_cents)} goal` : ""} from {prog?.[0]?.donor_count ?? 0} donors{c.ends_at ? `, ends ${formatDate(c.ends_at)}` : ""}</p>
            {pct !== null ? <div className="mt-3 h-3 overflow-hidden rounded-full bg-paper-raised ring-1 ring-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% of goal`}><div className="h-full rounded-full bg-teal" style={{ width: `${pct}%` }} /></div> : null}
          </div>
          {c.story ? <div className="prose-body mt-10 whitespace-pre-line">{c.story}</div> : null}
          {donors?.length ? (
            <section className="mt-10">
              <h2 className="text-xl font-semibold">Recent supporters</h2>
              <ul className="mt-3 flex flex-wrap gap-2">{donors.map((d: { donor_name: string; created_at: string }, i: number) => <li key={i}><Badge>{d.donor_name}</Badge></li>)}</ul>
            </section>
          ) : null}
        </article>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-6 shadow-[var(--shadow-raised)]">
            <h2 className="text-xl font-semibold">Give to this campaign</h2>
            <div className="mt-4">
              {cancelled ? <div className="mb-4"><FormMessage tone="info">Checkout was cancelled. You weren&apos;t charged.</FormMessage></div> : null}
              {open ? (
                <DonateForm campaignId={c.id} amounts={c.suggested_amounts_cents} allowRecurring={c.allow_recurring} email={user?.email} name={user?.displayName} />
              ) : (
                <p className="text-ink-muted">This campaign isn&apos;t accepting donations right now.</p>
              )}
            </div>
            <p className="mt-5 border-t border-line pt-4 text-sm text-ink-muted">{taxNote}</p>
          </div>
        </aside>
      </Container>
    </>
  );
}
