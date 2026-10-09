import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarClock, MapPin, Truck } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Badge, Container, PillarTag } from "@/components/ui/misc";
import { ReportButton } from "@/components/report-button";
import { RESOURCE_CATEGORY_LABEL, type Pillar, type ResourceCategory } from "@/lib/constants";
import { getCurrentUser, getMyMemberships, getSupabase } from "@/lib/supabase/server";
import { formatDateTime, formatNumber, mediaUrl } from "@/lib/utils";
import { RequestForm } from "./request-form";

type Params = { params: Promise<{ id: string }> };

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.from("resources").select("*, organizations(id, slug, name, status)").eq("id", id).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const r = await load((await params).id);
  if (!r) return { title: "Listing not found" };
  return {
    title: r.title,
    description: r.description?.slice(0, 160) ?? undefined,
    alternates: { canonical: `/resources/${r.id}` },
    robots: r.is_demo ? { index: false } : undefined,
  };
}

export default async function ResourcePage({ params }: Params) {
  const { id } = await params;
  const r = await load(id);
  if (!r) notFound();
  const user = await getCurrentUser();
  const memberships = await getMyMemberships();
  const supabase = (await getSupabase())!;
  const myCoordOrgs = memberships
    .filter((m) => ["owner", "admin", "coordinator"].includes(m.role) && m.organizations.status === "approved" && m.org_id !== r.org_id)
    .map((m) => ({ id: m.org_id, name: m.organizations.name }));
  const isOwner = memberships.some((m) => m.org_id === r.org_id);
  const { data: priv } = await supabase.from("resource_private_details").select("pickup_address, contact_name, contact_phone, access_notes").eq("resource_id", r.id).maybeSingle();
  const photos = (r.photo_paths as string[]).map(mediaUrl).filter(Boolean) as string[];
  const available = Number(r.quantity_available);
  const isNeed = r.kind === "need";

  return (
    <Container className="grid gap-12 py-12 lg:grid-cols-[1fr_380px]">
      <article className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={isNeed ? "warn" : "teal"}>{isNeed ? "Needed" : "Available"}</Badge>
          <span className="text-ink-muted">{RESOURCE_CATEGORY_LABEL[r.category as ResourceCategory]}</span>
          {r.is_demo ? <Badge tone="marigold">Demo data</Badge> : null}
          {r.status !== "published" ? <Badge>{r.status.replace("_", " ")}</Badge> : null}
        </div>
        <h1 className="mt-3 text-4xl font-bold sm:text-5xl">{r.title}</h1>
        <p className="mt-2 text-ink-soft">
          {isNeed ? "Requested by " : "Offered by "}
          <Link href={`/organizations/${r.organizations?.slug}`} className="font-semibold text-teal-strong hover:underline">
            {r.organizations?.name}
          </Link>
        </p>

        <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-line bg-line sm:grid-cols-3">
          <div className="bg-surface p-5">
            <dt className="text-sm text-ink-muted">{isNeed ? "Still needed" : "Available now"}</dt>
            <dd className="font-display text-3xl font-bold">
              {formatNumber(available, 2)} <span className="text-base font-normal text-ink-muted">{r.unit}</span>
            </dd>
          </div>
          <div className="bg-surface p-5">
            <dt className="text-sm text-ink-muted">{isNeed ? "Total needed" : "Total listed"}</dt>
            <dd className="font-display text-3xl font-bold">
              {formatNumber(r.quantity_total, 2)} <span className="text-base font-normal text-ink-muted">{r.unit}</span>
            </dd>
          </div>
          <div className="col-span-2 bg-surface p-5 sm:col-span-1">
            <dt className="text-sm text-ink-muted">Fulfillment</dt>
            <dd className="mt-1 flex items-center gap-2 font-semibold">
              <Truck className="h-5 w-5 text-ink-muted" aria-hidden="true" />
              {r.fulfillment === "either" ? "Pickup or delivery" : r.fulfillment === "pickup" ? "Pickup" : "Delivery"}
            </dd>
          </div>
        </dl>

        {photos.length ? (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((src, i) => (
              <div key={src} className="relative aspect-square overflow-hidden rounded-[14px] bg-paper">
                <Image src={src} alt={`${r.title}, photo ${i + 1}`} fill sizes="(max-width: 640px) 50vw, 240px" className="object-cover" />
              </div>
            ))}
          </div>
        ) : null}

        {r.description ? <div className="prose-body mt-8 whitespace-pre-line">{r.description}</div> : null}

        <ul className="mt-8 space-y-3">
          {r.general_location ? (
            <li className="flex gap-3">
              <MapPin className="mt-0.5 h-5 w-5 text-ink-muted" aria-hidden="true" />
              <span>{r.general_location}. The exact address is shared after a request is approved.</span>
            </li>
          ) : null}
          {r.expires_at ? (
            <li className="flex gap-3">
              <CalendarClock className="mt-0.5 h-5 w-5 text-ink-muted" aria-hidden="true" />
              <span>
                {r.is_perishable ? "Use by" : "Available until"} {formatDateTime(r.expires_at)}
              </span>
            </li>
          ) : null}
        </ul>

        {r.handling_requirements || r.is_perishable ? (
          <section className="mt-8 rounded-[var(--radius-md)] border border-warn/30 bg-warn-wash p-5">
            <h2 className="flex items-center gap-2 font-semibold text-warn">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              Handling
            </h2>
            {r.handling_requirements ? <p className="mt-2 whitespace-pre-line text-ink-soft">{r.handling_requirements}</p> : null}
            {r.is_perishable ? (
              <p className="mt-2 text-sm text-ink-soft">
                Handling details come from the listing organization. {`The platform doesn't inspect or certify food safety.`}
              </p>
            ) : null}
          </section>
        ) : null}

        {r.special_instructions ? (
          <section className="mt-8">
            <h2 className="text-xl font-semibold">Special instructions</h2>
            <p className="mt-2 whitespace-pre-line text-ink-soft">{r.special_instructions}</p>
          </section>
        ) : null}

        {priv ? (
          <section className="mt-8 rounded-[var(--radius-md)] border border-teal/30 bg-teal-wash p-5">
            <h2 className="font-semibold text-teal-strong">Pickup details (visible to approved participants only)</h2>
            <dl className="mt-3 space-y-1 text-ink">
              {priv.pickup_address ? <div><dt className="inline font-semibold">Address: </dt><dd className="inline">{priv.pickup_address}</dd></div> : null}
              {priv.contact_name ? <div><dt className="inline font-semibold">Contact: </dt><dd className="inline">{priv.contact_name} {priv.contact_phone ?? ""}</dd></div> : null}
              {priv.access_notes ? <div><dt className="inline font-semibold">Notes: </dt><dd className="inline">{priv.access_notes}</dd></div> : null}
            </dl>
          </section>
        ) : null}

        {(r.pillars as Pillar[]).length ? (
          <div className="mt-8 flex flex-wrap gap-2">
            {(r.pillars as Pillar[]).map((p) => (
              <PillarTag key={p} pillar={p} />
            ))}
          </div>
        ) : null}
        {user ? (
          <div className="mt-8">
            <ReportButton targetType="resource" targetId={r.id} label="Report this listing" />
          </div>
        ) : null}
      </article>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-6 shadow-[var(--shadow-raised)]">
          <h2 className="text-xl font-semibold">{isNeed ? "Help meet this need" : "Request this resource"}</h2>
          <div className="mt-4">
            {isOwner ? (
              <LinkButton href={`/dashboard/org/${r.org_id}/resources/${r.id}`} variant="secondary">
                Manage this listing
              </LinkButton>
            ) : r.status !== "published" || available <= 0 ? (
              <p className="text-ink-muted">This listing isn&apos;t accepting requests right now.</p>
            ) : !user ? (
              <div className="flex flex-col gap-3">
                <p className="text-ink-soft">Resource requests are made by approved organizations.</p>
                <LinkButton href={`/login?next=/resources/${r.id}`}>Sign in</LinkButton>
              </div>
            ) : myCoordOrgs.length ? (
              <RequestForm resourceId={r.id} orgs={myCoordOrgs} max={available} unit={r.unit} kind={r.kind} />
            ) : (
              <div className="flex flex-col gap-3 text-ink-soft">
                <p>Requests come from approved organizations, made by a coordinator or above.</p>
                <p>
                  Want to help as an individual? <Link href={`/inbox/new?to_org=${r.org_id}`} className="font-semibold text-teal-strong underline">Message the organization</Link>.
                </p>
                <LinkButton href="/dashboard/organizations/new" variant="secondary">
                  Register an organization
                </LinkButton>
              </div>
            )}
          </div>
        </div>
      </aside>
    </Container>
  );
}
