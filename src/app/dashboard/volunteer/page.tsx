import Link from "next/link";
import { Download } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/button";
import { Badge, Container } from "@/components/ui/misc";
import { cancelApplication } from "@/app/actions/volunteer";
import { cancelRegistration } from "@/app/actions/events";
import { requireUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatNumber } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting approval",
  approved: "Confirmed",
  waitlisted: "Waitlisted",
  declined: "Not selected",
  cancelled: "Cancelled",
  completed: "Completed",
  no_show: "Marked absent",
  confirmed: "Registered",
  checked_in: "Attended",
  pending_payment: "Payment due",
  refunded: "Refunded",
};

export default async function VolunteerDashboard() {
  const user = await requireUser("/dashboard/volunteer");
  const supabase = (await getSupabase())!;
  const [apps, regs, hours] = await Promise.all([
    supabase
      .from("volunteer_applications")
      .select("id, status, created_at, volunteer_opportunities(id, title, starts_at, ends_at, timezone, organizations(name, slug)), volunteer_shifts(starts_at, label)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("event_registrations")
      .select("id, status, ticket_code, events(id, title, starts_at, ends_at, timezone)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("volunteer_hours")
      .select("id, hours, status, verified_at, created_at, organizations(name), volunteer_applications(volunteer_opportunities(title))")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  type App = { id: string; status: string; created_at: string; volunteer_opportunities: { id: string; title: string; starts_at: string | null; ends_at: string | null; timezone: string; organizations: { name: string; slug: string } }; volunteer_shifts: { starts_at: string; label: string | null } | null };
  type Reg = { id: string; status: string; ticket_code: string; events: { id: string; title: string; starts_at: string; ends_at: string; timezone: string } };
  type Hour = { id: string; hours: number; status: string; verified_at: string | null; created_at: string; organizations: { name: string }; volunteer_applications: { volunteer_opportunities: { title: string } } };
  const appRows = (apps.data ?? []) as unknown as App[];
  const regRows = (regs.data ?? []) as unknown as Reg[];
  const hourRows = (hours.data ?? []) as unknown as Hour[];
  const verified = hourRows.filter((h) => h.status === "verified").reduce((a, h) => a + Number(h.hours), 0);
  const pendingHours = hourRows.filter((h) => h.status === "recorded").reduce((a, h) => a + Number(h.hours), 0);
  const now = Date.now();

  return (
    <Container className="py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Your volunteering</h1>
          <p className="mt-2 text-ink-soft">Commitments, event tickets and your verified service record.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/dashboard/volunteer/profile" variant="secondary">
            Volunteer preferences
          </LinkButton>
          <a href="/api/me/hours.csv" className="inline-flex h-11 items-center gap-2 rounded-full border border-line-strong bg-surface px-5 font-semibold hover:border-ink">
            <Download className="h-4 w-4" aria-hidden="true" />
            Download hours (CSV)
          </a>
        </div>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-line bg-line sm:grid-cols-3">
        <div className="bg-surface p-5">
          <dt className="text-sm text-ink-muted">Verified hours</dt>
          <dd className="font-display text-4xl font-bold">{formatNumber(verified, 1)}</dd>
        </div>
        <div className="bg-surface p-5">
          <dt className="text-sm text-ink-muted">Awaiting verification</dt>
          <dd className="font-display text-4xl font-bold text-ink-muted">{formatNumber(pendingHours, 1)}</dd>
        </div>
        <div className="col-span-2 bg-surface p-5 sm:col-span-1">
          <dt className="text-sm text-ink-muted">Completed commitments</dt>
          <dd className="font-display text-4xl font-bold">{appRows.filter((a) => a.status === "completed").length}</dd>
        </div>
      </dl>

      <section className="mt-12" aria-labelledby="opps">
        <h2 id="opps" className="text-2xl font-semibold">
          Volunteer sign-ups
        </h2>
        {appRows.length ? (
          <div className="mt-4 overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-surface">
            <table className="w-full min-w-[640px] text-left">
              <thead className="border-b border-line text-sm text-ink-muted">
                <tr>
                  <th scope="col" className="p-4 font-semibold">Opportunity</th>
                  <th scope="col" className="p-4 font-semibold">When</th>
                  <th scope="col" className="p-4 font-semibold">Status</th>
                  <th scope="col" className="p-4"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {appRows.map((a) => {
                  const when = a.volunteer_shifts?.starts_at ?? a.volunteer_opportunities.starts_at;
                  const future = !when || new Date(when).getTime() > now;
                  return (
                    <tr key={a.id}>
                      <td className="p-4">
                        <Link href={`/volunteer/${a.volunteer_opportunities.id}`} className="font-semibold hover:underline">
                          {a.volunteer_opportunities.title}
                        </Link>
                        <p className="text-sm text-ink-muted">{a.volunteer_opportunities.organizations.name}</p>
                      </td>
                      <td className="p-4 text-sm">{when ? formatDateTime(when, a.volunteer_opportunities.timezone) : "Flexible"}</td>
                      <td className="p-4">
                        <Badge tone={a.status === "approved" || a.status === "completed" ? "teal" : a.status === "declined" || a.status === "no_show" ? "danger" : "neutral"}>
                          {STATUS_LABEL[a.status] ?? a.status}
                        </Badge>
                      </td>
                      <td className="p-4 text-right">
                        {["pending", "approved", "waitlisted"].includes(a.status) && future ? (
                          <form action={cancelApplication}>
                            <input type="hidden" name="application_id" value={a.id} />
                            <Button type="submit" variant="ghost" size="sm" className="text-danger">
                              Cancel
                            </Button>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-ink-muted">
            No sign-ups yet. <Link href="/volunteer" className="font-semibold text-teal-strong underline">Find an opportunity</Link>.
          </p>
        )}
      </section>

      <section className="mt-12" aria-labelledby="events">
        <h2 id="events" className="text-2xl font-semibold">
          Event registrations
        </h2>
        {regRows.length ? (
          <ul className="mt-4 divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-surface">
            {regRows.map((r) => {
              const future = new Date(r.events.starts_at).getTime() > now;
              return (
                <li key={r.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <Link href={`/events/${r.events.id}`} className="font-semibold hover:underline">
                      {r.events.title}
                    </Link>
                    <p className="text-sm text-ink-muted">
                      {formatDateTime(r.events.starts_at, r.events.timezone)}, ticket <span className="font-semibold tracking-wide">{r.ticket_code}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={r.status === "confirmed" || r.status === "checked_in" ? "teal" : r.status === "pending_payment" ? "danger" : "neutral"}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                    {r.status === "pending_payment" ? (
                      <LinkButton href={`/api/checkout/event?registration=${r.id}`} size="sm">
                        Pay now
                      </LinkButton>
                    ) : null}
                    {["confirmed", "waitlisted", "pending_payment"].includes(r.status) && future ? (
                      <form action={cancelRegistration}>
                        <input type="hidden" name="registration_id" value={r.id} />
                        <Button type="submit" variant="ghost" size="sm" className="text-danger">
                          Cancel
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-4 text-ink-muted">No event registrations yet.</p>
        )}
      </section>

      <section className="mt-12" aria-labelledby="hours">
        <h2 id="hours" className="text-2xl font-semibold">
          Service record
        </h2>
        {hourRows.length ? (
          <ul className="mt-4 divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-surface">
            {hourRows.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-semibold">{h.volunteer_applications?.volunteer_opportunities?.title}</p>
                  <p className="text-sm text-ink-muted">
                    {h.organizations.name}, recorded {formatDate(h.created_at)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-xl font-bold">{formatNumber(h.hours, 2)} h</p>
                  <Badge tone={h.status === "verified" ? "teal" : h.status === "rejected" ? "danger" : "neutral"}>
                    {h.status === "verified" ? "Verified" : h.status === "rejected" ? "Not verified" : "Pending verification"}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-ink-muted">Hours appear here after an organization records your attendance.</p>
        )}
      </section>
    </Container>
  );
}
