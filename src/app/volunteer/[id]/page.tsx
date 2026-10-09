import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Laptop, MapPin, ShieldCheck, Users } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Badge, Container, PillarTag } from "@/components/ui/misc";
import { ReportButton } from "@/components/report-button";
import type { Pillar } from "@/lib/constants";
import { getCurrentUser, getSupabase } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import { ApplyForm } from "./apply-form";

type Params = { params: Promise<{ id: string }> };

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data } = await supabase
    .from("volunteer_opportunities")
    .select("*, organizations(id, slug, name, verification_level, status), volunteer_shifts(id, label, starts_at, ends_at, capacity)")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const opp = await load((await params).id);
  if (!opp) return { title: "Opportunity not found" };
  return {
    title: `${opp.title}: volunteer with ${opp.organizations?.name}`,
    description: opp.summary ?? undefined,
    alternates: { canonical: `/volunteer/${opp.id}` },
    robots: opp.is_demo ? { index: false } : undefined,
  };
}

export default async function OpportunityPage({ params }: Params) {
  const { id } = await params;
  const opp = await load(id);
  if (!opp) notFound();
  const supabase = (await getSupabase())!;
  const user = await getCurrentUser();

  type ShiftRow = { id: string; label: string | null; starts_at: string; ends_at: string; capacity: number };
  const shiftsRaw = ((opp.volunteer_shifts ?? []) as ShiftRow[])
    .filter((s) => new Date(s.starts_at) > new Date())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const shifts = await Promise.all(
    shiftsRaw.map(async (s) => {
      const { data } = await supabase.rpc("opportunity_slots_taken", { p_opp: opp.id, p_shift: s.id });
      return { id: s.id, label: `${s.label ? `${s.label}, ` : ""}${formatDateTime(s.starts_at, opp.timezone)}`, remaining: s.capacity - Number(data ?? 0) };
    }),
  );
  let remaining: number | null = null;
  if (opp.capacity && !shifts.length) {
    const { data } = await supabase.rpc("opportunity_slots_taken", { p_opp: opp.id, p_shift: null });
    remaining = opp.capacity - Number(data ?? 0);
  }

  const { data: myApp } = user
    ? await supabase
        .from("volunteer_applications")
        .select("id, status")
        .eq("opportunity_id", opp.id)
        .eq("user_id", user.id)
        .not("status", "in", "(cancelled,declined)")
        .maybeSingle()
    : { data: null };

  const open = opp.status === "published" && opp.organizations?.status === "approved";

  const jsonLd = opp.is_demo
    ? null
    : {
        "@context": "https://schema.org",
        "@type": "VolunteerAction",
        name: opp.title,
        description: opp.summary,
        agent: { "@type": "Organization", name: opp.organizations?.name },
        startTime: opp.starts_at ?? undefined,
      };

  return (
    <Container className="grid gap-12 py-12 lg:grid-cols-[1fr_380px]">
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} /> : null}
      <article className="min-w-0">
        <Link href={`/organizations/${opp.organizations?.slug}`} className="font-semibold text-teal-strong hover:underline">
          {opp.organizations?.name}
        </Link>
        <h1 className="mt-2 text-4xl font-bold sm:text-5xl">{opp.title}</h1>
        {opp.summary ? <p className="mt-4 text-xl text-ink-soft">{opp.summary}</p> : null}
        <div className="mt-5 flex flex-wrap gap-2">
          {opp.is_demo ? <Badge tone="marigold">Demo data</Badge> : null}
          {opp.status !== "published" ? <Badge tone="warn">{opp.status === "draft" ? "Draft, not public" : `Status: ${opp.status}`}</Badge> : null}
          {(opp.pillars as Pillar[]).map((p) => (
            <PillarTag key={p} pillar={p} size="md" />
          ))}
        </div>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          <li className="flex gap-3">
            <CalendarDays className="mt-0.5 h-5 w-5 text-ink-muted" aria-hidden="true" />
            <span>{opp.starts_at ? formatDateTime(opp.starts_at, opp.timezone) : shifts.length ? `${shifts.length} upcoming shifts` : "Flexible schedule"}</span>
          </li>
          <li className="flex gap-3">
            {opp.is_virtual ? <Laptop className="mt-0.5 h-5 w-5 text-ink-muted" aria-hidden="true" /> : <MapPin className="mt-0.5 h-5 w-5 text-ink-muted" aria-hidden="true" />}
            <span>{opp.is_virtual ? "Remote" : (opp.general_location ?? "Exact location shared once you're confirmed")}</span>
          </li>
          {remaining !== null ? (
            <li className="flex gap-3">
              <Users className="mt-0.5 h-5 w-5 text-ink-muted" aria-hidden="true" />
              <span>{remaining > 0 ? `${remaining} of ${opp.capacity} spots open` : "Full, waitlist open"}</span>
            </li>
          ) : null}
          <li className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-ink-muted" aria-hidden="true" />
            <span>{opp.allows_minors ? `Volunteers under 18 welcome with guardian consent${opp.min_age ? ` (age ${opp.min_age}+)` : ""}` : "Adults 18 and over"}</span>
          </li>
        </ul>
        {opp.skills_required?.length ? (
          <section className="mt-10">
            <h2 className="text-xl font-semibold">Helpful skills</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {(opp.skills_required as string[]).map((s) => (
                <Badge key={s}>{s}</Badge>
              ))}
            </div>
          </section>
        ) : null}
        {opp.description ? (
          <section className="mt-10">
            <h2 className="text-xl font-semibold">What you&apos;ll do</h2>
            <div className="prose-body mt-3 whitespace-pre-line">{opp.description}</div>
          </section>
        ) : null}
        {user ? (
          <div className="mt-10">
            <ReportButton targetType="opportunity" targetId={opp.id} label="Report this listing" />
          </div>
        ) : null}
      </article>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-6 shadow-[var(--shadow-raised)]">
          <h2 className="text-xl font-semibold">Volunteer</h2>
          <div className="mt-4">
            {!open ? (
              <p className="text-ink-muted">This opportunity isn&apos;t accepting volunteers right now.</p>
            ) : !user ? (
              <div className="flex flex-col gap-3">
                <p className="text-ink-soft">Sign in or create a free account to sign up. It takes about a minute.</p>
                <LinkButton href={`/login?next=/volunteer/${opp.id}`}>Sign in to volunteer</LinkButton>
                <LinkButton href="/signup" variant="secondary">
                  Create an account
                </LinkButton>
              </div>
            ) : myApp ? (
              <div className="flex flex-col gap-3">
                <p>
                  You&apos;re <strong>{myApp.status === "approved" ? "confirmed" : myApp.status}</strong> for this opportunity.
                </p>
                <LinkButton href="/dashboard/volunteer" variant="secondary">
                  View my commitments
                </LinkButton>
              </div>
            ) : !user.isAdult && !opp.allows_minors ? (
              <p className="text-ink-muted">This opportunity is for volunteers 18 and older. Browse others that welcome youth volunteers.</p>
            ) : (
              <ApplyForm opportunityId={opp.id} shifts={shifts} isAdult={user.isAdult} requiresApproval={opp.requires_approval} />
            )}
          </div>
        </div>
      </aside>
    </Container>
  );
}
