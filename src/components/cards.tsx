import Link from "next/link";
import Image from "next/image";
import { CalendarDays, Clock, Laptop, MapPin, Package, Users } from "lucide-react";
import { Badge, PillarTag, VerificationBadge } from "@/components/ui/misc";
import { EVENT_TYPE_LABEL, ORG_TYPE_LABEL, RESOURCE_CATEGORY_LABEL, type EventType, type OrgType, type ResourceCategory } from "@/lib/constants";
import type { EventCard, OpportunityCard, OrgCard, ResourceCard } from "@/lib/queries";
import { formatCurrency, formatDateTime, formatNumber, mediaUrl } from "@/lib/utils";

const cardShell =
  "group relative flex h-full flex-col rounded-[var(--radius-lg)] border border-line bg-surface p-5 transition-colors hover:border-ink/40 focus-within:border-teal";

function DemoTag({ show }: { show: boolean }) {
  return show ? <Badge tone="marigold">Demo data</Badge> : null;
}

export function OrgCardView({ org }: { org: OrgCard }) {
  const logo = mediaUrl(org.logo_path);
  return (
    <article className={cardShell}>
      <div className="flex items-start gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[14px] bg-paper font-display text-xl font-bold text-ink">
          {logo ? <Image src={logo} alt="" width={56} height={56} className="h-full w-full object-cover" /> : org.name.slice(0, 1)}
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold leading-snug">
            <Link href={`/organizations/${org.slug}`} className="after:absolute after:inset-0 after:content-['']">
              {org.name}
            </Link>
          </h3>
          <p className="text-sm text-ink-muted">
            {ORG_TYPE_LABEL[org.org_type as OrgType]}
            {org.city ? `, ${org.city}${org.region ? `, ${org.region}` : ""}` : ""}
          </p>
        </div>
      </div>
      {org.mission ? <p className="mt-4 line-clamp-3 text-[0.97rem] text-ink-soft">{org.mission}</p> : null}
      <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
        <VerificationBadge level={org.verification_level} />
        <DemoTag show={org.is_demo} />
        {org.pillars.slice(0, 3).map((p) => (
          <PillarTag key={p} pillar={p} />
        ))}
      </div>
    </article>
  );
}

export function OpportunityCardView({ opp }: { opp: OpportunityCard }) {
  return (
    <article className={cardShell}>
      <p className="text-sm font-semibold text-teal-strong">{opp.organizations?.name}</p>
      <h3 className="mt-1 text-lg font-semibold leading-snug">
        <Link href={`/volunteer/${opp.id}`} className="after:absolute after:inset-0 after:content-['']">
          {opp.title}
        </Link>
      </h3>
      {opp.summary ? <p className="mt-2 line-clamp-2 text-[0.97rem] text-ink-soft">{opp.summary}</p> : null}
      <ul className="mt-4 space-y-1.5 text-[0.93rem] text-ink-soft">
        {opp.starts_at ? (
          <li className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-ink-muted" aria-hidden="true" />
            {formatDateTime(opp.starts_at, opp.timezone)}
          </li>
        ) : (
          <li className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-ink-muted" aria-hidden="true" />
            Flexible schedule
          </li>
        )}
        <li className="flex items-center gap-2">
          {opp.is_virtual ? <Laptop className="h-4 w-4 text-ink-muted" aria-hidden="true" /> : <MapPin className="h-4 w-4 text-ink-muted" aria-hidden="true" />}
          {opp.is_virtual ? "Remote" : (opp.general_location ?? "Location shared after sign-up")}
        </li>
        {opp.capacity ? (
          <li className="flex items-center gap-2">
            <Users className="h-4 w-4 text-ink-muted" aria-hidden="true" />
            {opp.capacity} volunteers needed
          </li>
        ) : null}
      </ul>
      <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
        <DemoTag show={opp.is_demo} />
        {opp.allows_minors ? <Badge>Youth welcome with consent</Badge> : null}
        {opp.pillars.slice(0, 2).map((p) => (
          <PillarTag key={p} pillar={p} />
        ))}
      </div>
    </article>
  );
}

export function EventCardView({ event }: { event: EventCard }) {
  const cover = mediaUrl(event.cover_path);
  const d = new Date(event.starts_at);
  const month = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: event.timezone }).format(d);
  const day = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: event.timezone }).format(d);
  return (
    <article className={`${cardShell} p-0 overflow-hidden`}>
      {cover ? (
        <div className="relative aspect-[16/9] bg-paper">
          <Image src={cover} alt="" fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" />
        </div>
      ) : null}
      <div className="flex flex-1 gap-4 p-5">
        <div className="flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-[12px] bg-ink text-white" aria-hidden="true">
          <span className="text-[0.75rem] font-semibold">{month}</span>
          <span className="font-display text-2xl font-bold leading-none">{day}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-sm font-semibold text-teal-strong">{EVENT_TYPE_LABEL[event.event_type as EventType]}</p>
          <h3 className="mt-0.5 text-lg font-semibold leading-snug">
            <Link href={`/events/${event.id}`} className="after:absolute after:inset-0 after:content-['']">
              {event.title}
            </Link>
          </h3>
          <p className="mt-1 text-[0.93rem] text-ink-soft">{formatDateTime(event.starts_at, event.timezone)}</p>
          <p className="text-[0.93rem] text-ink-muted">
            {event.is_virtual ? "Online" : (event.venue_name ?? event.general_location ?? "Venue to be announced")}
            {event.organizations ? `, hosted by ${event.organizations.name}` : ""}
          </p>
          <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
            {event.status === "cancelled" ? <Badge tone="danger">Cancelled</Badge> : null}
            <Badge tone={event.price_cents ? "neutral" : "teal"}>{event.price_cents ? formatCurrency(event.price_cents) : "Free"}</Badge>
            <DemoTag show={event.is_demo} />
          </div>
        </div>
      </div>
    </article>
  );
}

export function ResourceCardView({ resource }: { resource: ResourceCard }) {
  const photo = mediaUrl(resource.photo_paths?.[0]);
  const isNeed = resource.kind === "need";
  return (
    <article className={cardShell}>
      <div className="flex items-start justify-between gap-3">
        <Badge tone={isNeed ? "warn" : "teal"}>{isNeed ? "Needed" : "Available"}</Badge>
        <span className="text-sm text-ink-muted">{RESOURCE_CATEGORY_LABEL[resource.category as ResourceCategory]}</span>
      </div>
      <div className="mt-3 flex gap-4">
        {photo ? (
          <Image src={photo} alt="" width={72} height={72} className="h-18 w-18 shrink-0 rounded-[12px] object-cover" />
        ) : (
          <div className="grid h-18 w-18 shrink-0 place-items-center rounded-[12px] bg-paper text-ink-muted" aria-hidden="true">
            <Package className="h-7 w-7" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-lg font-semibold leading-snug">
            <Link href={`/resources/${resource.id}`} className="after:absolute after:inset-0 after:content-['']">
              {resource.title}
            </Link>
          </h3>
          <p className="mt-1 font-display text-xl font-semibold">
            {formatNumber(resource.quantity_available, 2)} <span className="text-base font-normal text-ink-muted">{resource.unit}</span>
          </p>
        </div>
      </div>
      <p className="mt-3 text-[0.93rem] text-ink-muted">
        {resource.organizations?.name}
        {resource.general_location ? `, ${resource.general_location}` : ""}
      </p>
      <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
        {resource.is_perishable && resource.expires_at ? (
          <Badge tone="warn">Use by {new Date(resource.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Badge>
        ) : null}
        <Badge>{resource.fulfillment === "either" ? "Pickup or delivery" : resource.fulfillment === "pickup" ? "Pickup" : "Delivery"}</Badge>
        <DemoTag show={resource.is_demo} />
      </div>
    </article>
  );
}

export function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

export function Pagination({ page, pageCount, basePath, params }: { page: number; pageCount: number; basePath: string; params: Record<string, string | undefined> }) {
  if (pageCount <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-between gap-4">
      {page > 1 ? (
        <Link href={href(page - 1)} className="rounded-full border border-line-strong px-5 py-2.5 font-semibold hover:border-ink">
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-ink-muted">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={href(page + 1)} className="rounded-full border border-line-strong px-5 py-2.5 font-semibold hover:border-ink">
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
