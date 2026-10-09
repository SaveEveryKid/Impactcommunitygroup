import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Laptop, MapPin, Ticket, Users } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/button";
import { Badge, Container, PillarTag } from "@/components/ui/misc";
import { ReportButton } from "@/components/report-button";
import { cancelRegistration } from "@/app/actions/events";
import { EVENT_TYPE_LABEL, type EventType, type Pillar } from "@/lib/constants";
import { getCurrentUser, getSupabase } from "@/lib/supabase/server";
import { formatCurrency, formatDateTime, mediaUrl } from "@/lib/utils";
import { siteUrl } from "@/lib/env";
import { RegisterForm } from "./register-form";

type Params = { params: Promise<{ id: string }> };

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.from("events").select("*, organizations(id, slug, name, status)").eq("id", id).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const ev = await load((await params).id);
  if (!ev) return { title: "Event not found" };
  return {
    title: ev.title,
    description: ev.summary ?? undefined,
    alternates: { canonical: `/events/${ev.id}` },
    openGraph: { title: ev.title, description: ev.summary ?? undefined, images: ev.cover_path ? [mediaUrl(ev.cover_path)!] : undefined },
    robots: ev.visibility !== "public" || ev.is_demo ? { index: false } : undefined,
  };
}

export default async function EventPage({ params }: Params) {
  const { id } = await params;
  const ev = await load(id);
  if (!ev) notFound();
  const supabase = (await getSupabase())!;
  const user = await getCurrentUser();

  const [{ data: taken }, myRegRes, privateRes] = await Promise.all([
    supabase.rpc("event_seats_taken", { p_event: ev.id }),
    user
      ? supabase.from("event_registrations").select("id, status, ticket_code").eq("event_id", ev.id).eq("user_id", user.id).not("status", "in", "(cancelled,refunded)").maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("event_private_details").select("virtual_url, attendee_instructions").eq("event_id", ev.id).maybeSingle(),
  ]);
  const myReg = myRegRes.data as { id: string; status: string; ticket_code: string } | null;
  const seatsLeft = ev.capacity ? Math.max(0, ev.capacity - Number(taken ?? 0)) : null;
  const cover = mediaUrl(ev.cover_path);
  const isPast = new Date(ev.ends_at) < new Date();
  const regOpen =
    ev.status === "published" &&
    !isPast &&
    new Date(ev.starts_at) > new Date() &&
    (!ev.registration_closes_at || new Date(ev.registration_closes_at) > new Date()) &&
    (!ev.registration_opens_at || new Date(ev.registration_opens_at) <= new Date());

  const jsonLd =
    ev.visibility === "public" && !ev.is_demo
      ? {
          "@context": "https://schema.org",
          "@type": "Event",
          name: ev.title,
          description: ev.summary,
          startDate: ev.starts_at,
          endDate: ev.ends_at,
          eventStatus: ev.status === "cancelled" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
          eventAttendanceMode: ev.is_virtual ? "https://schema.org/OnlineEventAttendanceMode" : "https://schema.org/OfflineEventAttendanceMode",
          location: ev.is_virtual
            ? { "@type": "VirtualLocation", url: `${siteUrl}/events/${ev.id}` }
            : { "@type": "Place", name: ev.venue_name ?? ev.general_location, address: ev.venue_address ?? ev.general_location },
          organizer: { "@type": "Organization", name: ev.organizations?.name, url: `${siteUrl}/organizations/${ev.organizations?.slug}` },
          offers: { "@type": "Offer", price: (ev.price_cents / 100).toFixed(2), priceCurrency: ev.currency.toUpperCase(), url: `${siteUrl}/events/${ev.id}` },
        }
      : null;

  return (
    <>
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} /> : null}
      {cover ? (
        <div className="relative h-56 bg-ink sm:h-80">
          <Image src={cover} alt="" fill priority sizes="100vw" className="object-cover" />
        </div>
      ) : null}
      <Container className="grid gap-12 py-12 lg:grid-cols-[1fr_380px]">
        <article className="min-w-0">
          <p className="font-semibold text-teal-strong">{EVENT_TYPE_LABEL[ev.event_type as EventType]}</p>
          <h1 className="mt-2 text-4xl font-bold sm:text-5xl">{ev.title}</h1>
          {ev.summary ? <p className="mt-4 text-xl text-ink-soft">{ev.summary}</p> : null}
          <div className="mt-5 flex flex-wrap gap-2">
            {ev.status === "cancelled" ? <Badge tone="danger">Cancelled</Badge> : null}
            {ev.status === "draft" ? <Badge tone="warn">Draft, not public</Badge> : null}
            {ev.visibility !== "public" ? <Badge>{ev.visibility === "private" ? "Private event" : "Unlisted"}</Badge> : null}
            {ev.is_demo ? <Badge tone="marigold">Demo data</Badge> : null}
            {(ev.pillars as Pillar[]).map((p) => (
              <PillarTag key={p} pillar={p} size="md" />
            ))}
          </div>
          {ev.status === "cancelled" && ev.cancelled_reason ? (
            <p className="mt-6 rounded-[12px] bg-danger-wash p-4 text-danger">This event was cancelled: {ev.cancelled_reason}</p>
          ) : null}
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            <li className="flex gap-3">
              <CalendarDays className="mt-0.5 h-5 w-5 text-ink-muted" aria-hidden="true" />
              <span>
                {formatDateTime(ev.starts_at, ev.timezone)}
                <br />
                <span className="text-ink-muted">until {formatDateTime(ev.ends_at, ev.timezone)}</span>
              </span>
            </li>
            <li className="flex gap-3">
              {ev.is_virtual ? <Laptop className="mt-0.5 h-5 w-5 text-ink-muted" aria-hidden="true" /> : <MapPin className="mt-0.5 h-5 w-5 text-ink-muted" aria-hidden="true" />}
              <span>
                {ev.is_virtual ? "Online. The link is shared with registered attendees." : ev.venue_name ?? ev.general_location}
                {!ev.is_virtual && ev.venue_address ? (
                  <>
                    <br />
                    <span className="text-ink-muted">{ev.venue_address}</span>
                  </>
                ) : null}
              </span>
            </li>
            <li className="flex gap-3">
              <Ticket className="mt-0.5 h-5 w-5 text-ink-muted" aria-hidden="true" />
              <span>{ev.price_cents ? formatCurrency(ev.price_cents, ev.currency) : "Free"}</span>
            </li>
            {seatsLeft !== null ? (
              <li className="flex gap-3">
                <Users className="mt-0.5 h-5 w-5 text-ink-muted" aria-hidden="true" />
                <span>{seatsLeft > 0 ? `${seatsLeft} of ${ev.capacity} spots left` : ev.waitlist_enabled ? "Full, waitlist open" : "Full"}</span>
              </li>
            ) : null}
          </ul>
          {ev.description ? (
            <section className="mt-10">
              <h2 className="text-xl font-semibold">About this event</h2>
              <div className="prose-body mt-3 whitespace-pre-line">{ev.description}</div>
            </section>
          ) : null}
          <section className="mt-10">
            <h2 className="text-xl font-semibold">Hosted by</h2>
            <Link href={`/organizations/${ev.organizations?.slug}`} className="mt-2 inline-block text-lg font-semibold text-teal-strong hover:underline">
              {ev.organizations?.name}
            </Link>
          </section>
          {user ? (
            <div className="mt-10">
              <ReportButton targetType="event" targetId={ev.id} label="Report this event" />
            </div>
          ) : null}
        </article>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-6 shadow-[var(--shadow-raised)]">
            <h2 className="text-xl font-semibold">Registration</h2>
            <div className="mt-4 flex flex-col gap-3">
              {myReg ? (
                <>
                  {myReg.status === "confirmed" || myReg.status === "checked_in" ? (
                    <>
                      <p>You&apos;re registered.</p>
                      <p className="rounded-[12px] bg-paper p-4 text-center">
                        <span className="block text-sm text-ink-muted">Ticket code</span>
                        <span className="font-display text-3xl font-bold tracking-wider">{myReg.ticket_code}</span>
                      </p>
                      {privateRes.data?.virtual_url ? (
                        <a href={privateRes.data.virtual_url} rel="noopener noreferrer" target="_blank" className="font-semibold text-teal-strong underline">
                          Join online
                        </a>
                      ) : null}
                      {privateRes.data?.attendee_instructions ? <p className="whitespace-pre-line text-ink-soft">{privateRes.data.attendee_instructions}</p> : null}
                    </>
                  ) : myReg.status === "waitlisted" ? (
                    <p>You&apos;re on the waitlist. We&apos;ll notify you if a spot opens.</p>
                  ) : myReg.status === "pending_payment" ? (
                    <LinkButton href={`/api/checkout/event?registration=${myReg.id}`}>Complete payment</LinkButton>
                  ) : null}
                  {["confirmed", "waitlisted", "pending_payment"].includes(myReg.status) && !isPast ? (
                    <form action={cancelRegistration}>
                      <input type="hidden" name="registration_id" value={myReg.id} />
                      <input type="hidden" name="back" value={`/events/${ev.id}`} />
                      <Button type="submit" variant="ghost" size="sm" className="text-danger">
                        Cancel my registration
                      </Button>
                    </form>
                  ) : null}
                </>
              ) : !regOpen ? (
                <p className="text-ink-muted">{isPast ? "This event has ended." : ev.status === "cancelled" ? "This event was cancelled." : "Registration is closed."}</p>
              ) : !user ? (
                <>
                  <p className="text-ink-soft">Sign in to register. We&apos;ll send your ticket and a reminder.</p>
                  <LinkButton href={`/login?next=/events/${ev.id}`}>Sign in to register</LinkButton>
                </>
              ) : (
                <RegisterForm
                  eventId={ev.id}
                  label={seatsLeft === 0 ? "Join the waitlist" : ev.price_cents ? `Register, ${formatCurrency(ev.price_cents, ev.currency)}` : "Register for free"}
                />
              )}
            </div>
          </div>
        </aside>
      </Container>
    </>
  );
}
