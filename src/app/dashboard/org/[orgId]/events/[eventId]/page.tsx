import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { EventForm } from "@/components/event-form";
import { cancelAttendee, cancelEvent, checkIn, completeEvent, duplicateEvent, setEventDraft } from "@/app/actions/org-events";
import { requireOrg, roleAtLeast } from "@/lib/auth";
import { formatCurrency, formatDateTime, utcToZonedLocal } from "@/lib/utils";

type Row = { registration_id: string; user_id: string; display_name: string; email: string; status: string; ticket_code: string; checked_in_at: string | null; amount_cents: number };

export default async function ManageEvent({ params, searchParams }: { params: Promise<{ orgId: string; eventId: string }>; searchParams: Promise<{ error?: string; saved?: string; checked?: string; notice?: string }> }) {
  const { orgId, eventId } = await params;
  const sp = await searchParams;
  const { org, role, supabase } = await requireOrg(orgId);
  const { data: ev } = await supabase.from("events").select("*").eq("id", eventId).eq("org_id", orgId).maybeSingle();
  if (!ev) notFound();
  const isCoord = roleAtLeast(role, "coordinator");
  const [{ data: roster }, { data: priv }, { data: acct }] = await Promise.all([
    isCoord ? supabase.rpc("event_roster", { p_event: eventId }) : Promise.resolve({ data: [] }),
    supabase.from("event_private_details").select("virtual_url, attendee_instructions").eq("event_id", eventId).maybeSingle(),
    supabase.from("org_payment_accounts").select("charges_enabled").eq("org_id", orgId).maybeSingle(),
  ]);
  const rows = (roster ?? []) as Row[];
  const going = rows.filter((r) => ["confirmed", "checked_in"].includes(r.status));
  const checkedIn = rows.filter((r) => r.status === "checked_in").length;
  const hasPaid = rows.some((r) => r.amount_cents > 0 && ["confirmed", "checked_in", "pending_payment"].includes(r.status));
  const started = new Date(ev.starts_at) <= new Date();
  const hidden = <><input type="hidden" name="org_id" value={orgId} /><input type="hidden" name="event_id" value={eventId} /></>;

  return (
    <div className="space-y-10">
      {sp.saved ? <FormMessage tone="success">Event saved.</FormMessage> : null}
      {sp.notice ? <FormMessage tone="info">{sp.notice}</FormMessage> : null}
      {sp.error ? <FormMessage tone="error">{sp.error}</FormMessage> : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">{ev.title}</h2>
          <p className="mt-1 text-ink-soft">{formatDateTime(ev.starts_at, ev.timezone)} <Badge>{ev.status}</Badge></p>
          <Link href={`/events/${ev.id}`} className="mt-2 inline-block font-semibold text-teal-strong hover:underline">View event page</Link>
        </div>
        <dl className="flex gap-6">
          <div><dt className="text-sm text-ink-muted">Going</dt><dd className="font-display text-3xl font-bold">{going.length}{ev.capacity ? <span className="text-lg text-ink-muted">/{ev.capacity}</span> : null}</dd></div>
          <div><dt className="text-sm text-ink-muted">Checked in</dt><dd className="font-display text-3xl font-bold">{checkedIn}</dd></div>
          <div><dt className="text-sm text-ink-muted">Waitlist</dt><dd className="font-display text-3xl font-bold">{rows.filter((r) => r.status === "waitlisted").length}</dd></div>
        </dl>
      </div>

      {isCoord && ev.status === "published" ? (
        <section id="checkin" aria-labelledby="ci" className="rounded-[var(--radius-lg)] border-2 border-teal bg-surface p-6">
          <h3 id="ci" className="text-xl font-semibold">Check in</h3>
          {sp.checked ? <div className="mt-3"><FormMessage tone="success">Ticket {sp.checked} checked in.</FormMessage></div> : null}
          <form action={checkIn} className="mt-4 flex flex-wrap gap-3">
            {hidden}
            <label htmlFor="ticket" className="sr-only">Ticket code</label>
            <input id="ticket" name="ticket_code" required autoComplete="off" autoCapitalize="characters" autoFocus={Boolean(sp.checked)} placeholder="Ticket code" className="h-12 flex-1 rounded-[10px] border border-line-strong px-4 font-display text-xl tracking-widest uppercase" />
            <Button type="submit" size="lg">Check in</Button>
          </form>
        </section>
      ) : null}

      {isCoord ? (
        <section aria-labelledby="att">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id="att" className="text-xl font-semibold">Attendees</h3>
            <a href={`/api/org/${orgId}/events/${eventId}/attendees.csv`} className="inline-flex h-9 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold hover:border-ink">
              <Download className="h-4 w-4" aria-hidden="true" /> Attendance report (CSV)
            </a>
          </div>
          {rows.length ? (
            <div className="mt-3 overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface">
              <table className="w-full min-w-[640px] text-left">
                <thead className="border-b border-line text-sm text-ink-muted">
                  <tr><th scope="col" className="p-3">Name</th><th scope="col" className="p-3">Ticket</th><th scope="col" className="p-3">Status</th><th scope="col" className="p-3">Paid</th><th scope="col" className="p-3"><span className="sr-only">Actions</span></th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.registration_id}>
                      <td className="p-3"><p className="font-semibold">{r.display_name}</p><p className="break-all text-sm text-ink-muted">{r.email}</p></td>
                      <td className="p-3 font-semibold tracking-wider">{r.ticket_code}</td>
                      <td className="p-3"><Badge tone={r.status === "checked_in" ? "teal" : r.status === "confirmed" ? "neutral" : r.status === "waitlisted" ? "warn" : "neutral"}>{r.status.replace("_", " ")}</Badge></td>
                      <td className="p-3">{r.amount_cents ? formatCurrency(r.amount_cents) : "Free"}</td>
                      <td className="p-3 text-right">
                        {["confirmed", "waitlisted"].includes(r.status) && r.amount_cents === 0 ? (
                          <form action={cancelAttendee}>{hidden}<input type="hidden" name="registration_id" value={r.registration_id} /><Button type="submit" size="sm" variant="ghost" className="text-danger">Remove</Button></form>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-ink-muted">No registrations yet.</p>
          )}
        </section>
      ) : null}

      {isCoord ? (
        <section aria-labelledby="actions" className="grid gap-4 md:grid-cols-3">
          <h3 id="actions" className="sr-only">Event actions</h3>
          {ev.status === "published" && started ? (
            <form action={completeEvent} className="rounded-[var(--radius-md)] border border-line bg-surface p-5">
              {hidden}
              <p className="font-semibold">Mark completed</p>
              <p className="mt-1 text-sm text-ink-muted">Records the event and its {checkedIn} checked-in attendees as verified impact. Do this after check-in is finished.</p>
              <Button type="submit" className="mt-3" size="sm">Mark completed</Button>
            </form>
          ) : null}
          <form action={duplicateEvent} className="rounded-[var(--radius-md)] border border-line bg-surface p-5">
            {hidden}
            <input type="hidden" name="timezone" value={ev.timezone} />
            <p className="font-semibold">Duplicate</p>
            <label className="mt-2 flex flex-col gap-1 text-sm">New start time<input type="datetime-local" name="new_start" required className="h-10 rounded-[8px] border border-line-strong px-2" /></label>
            <Button type="submit" className="mt-3" size="sm" variant="secondary">Create copy as draft</Button>
          </form>
          {ev.status === "published" && !started && rows.length === 0 ? (
            <form action={setEventDraft} className="rounded-[var(--radius-md)] border border-line bg-surface p-5">
              {hidden}
              <p className="font-semibold">Unpublish</p>
              <p className="mt-1 text-sm text-ink-muted">Hide it while you make changes. Only possible before anyone registers.</p>
              <Button type="submit" className="mt-3" size="sm" variant="secondary">Move to draft</Button>
            </form>
          ) : null}
          {roleAtLeast(role, "admin") && ["published", "draft"].includes(ev.status) ? (
            <form action={cancelEvent} className="rounded-[var(--radius-md)] border border-danger/30 bg-surface p-5">
              {hidden}
              <p className="font-semibold text-danger">Cancel event</p>
              <label className="mt-2 flex flex-col gap-1 text-sm">Reason shared with attendees<input name="reason" required minLength={5} maxLength={500} className="h-10 rounded-[8px] border border-line-strong px-2" /></label>
              <label className="mt-2 flex items-start gap-2 text-sm"><input type="checkbox" name="confirm" className="mt-0.5 h-4 w-4" /> Notify all {rows.length} registrants{hasPaid ? " and refund paid tickets in full" : ""}</label>
              <Button type="submit" className="mt-3" size="sm" variant="danger">Cancel event</Button>
            </form>
          ) : null}
        </section>
      ) : null}

      {isCoord && ["draft", "published"].includes(ev.status) ? (
        <section aria-labelledby="edit">
          <h3 id="edit" className="text-xl font-semibold">Edit event</h3>
          <div className="mt-4 max-w-3xl rounded-[var(--radius-lg)] border border-line bg-surface p-6 sm:p-8">
            <EventForm
              orgId={orgId}
              canPublish={org.status === "approved"}
              canCharge={Boolean(acct?.charges_enabled)}
              event={{ ...ev, starts_local: utcToZonedLocal(ev.starts_at, ev.timezone), ends_local: utcToZonedLocal(ev.ends_at, ev.timezone), virtual_url: priv?.virtual_url, attendee_instructions: priv?.attendee_instructions, hasPaidRegistrations: hasPaid }}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
