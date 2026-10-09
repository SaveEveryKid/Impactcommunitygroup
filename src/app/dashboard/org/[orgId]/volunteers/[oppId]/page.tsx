import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { OpportunityForm } from "@/components/opportunity-form";
import { addShift, decideApplication, deleteShift, recordAttendance, removeVolunteer, setOpportunityStatus, verifyHours } from "@/app/actions/org-volunteers";
import { requireOrg, roleAtLeast } from "@/lib/auth";
import { formatDateTime, formatNumber, utcToZonedLocal } from "@/lib/utils";

type RosterRow = {
  application_id: string;
  user_id: string;
  display_name: string;
  email: string;
  status: string;
  shift_id: string | null;
  is_adult: boolean;
  guardian_name: string | null;
  guardian_email: string | null;
  hours: number | null;
  hours_status: string | null;
};

export default async function ManageOpportunity({ params, searchParams }: { params: Promise<{ orgId: string; oppId: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { orgId, oppId } = await params;
  const sp = await searchParams;
  const { org, role, supabase } = await requireOrg(orgId);
  const { data: opp } = await supabase.from("volunteer_opportunities").select("*, volunteer_shifts(id, label, starts_at, ends_at, capacity)").eq("id", oppId).eq("org_id", orgId).maybeSingle();
  if (!opp) notFound();
  const isCoord = roleAtLeast(role, "coordinator");
  const { data: roster, error: rosterErr } = isCoord ? await supabase.rpc("opportunity_roster", { p_opp: oppId }) : { data: [], error: null };
  const rows = (roster ?? []) as RosterRow[];
  const { data: hourIds } = isCoord
    ? await supabase.from("volunteer_hours").select("id, application_id, status").in("application_id", rows.map((r) => r.application_id).length ? rows.map((r) => r.application_id) : ["00000000-0000-0000-0000-000000000000"])
    : { data: [] };
  const hoursByApp = new Map((hourIds ?? []).map((h) => [h.application_id, h]));
  type Shift = { id: string; label: string | null; starts_at: string; ends_at: string; capacity: number };
  const shifts = ((opp.volunteer_shifts ?? []) as Shift[]).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const shiftLabel = (id: string | null) => {
    const s = shifts.find((x) => x.id === id);
    return s ? `${s.label ? `${s.label}, ` : ""}${formatDateTime(s.starts_at, opp.timezone)}` : "";
  };
  const groups: [string, RosterRow[]][] = [
    ["Awaiting your review", rows.filter((r) => r.status === "pending")],
    ["Confirmed", rows.filter((r) => r.status === "approved")],
    ["Waitlist", rows.filter((r) => r.status === "waitlisted")],
    ["Attendance recorded", rows.filter((r) => ["completed", "no_show"].includes(r.status))],
    ["Cancelled or declined", rows.filter((r) => ["cancelled", "declined"].includes(r.status))],
  ];
  const unverified = rows.filter((r) => r.hours_status === "recorded").map((r) => hoursByApp.get(r.application_id)?.id).filter(Boolean) as string[];
  const hidden = (extra: Record<string, string>) => (
    <>
      <input type="hidden" name="org_id" value={orgId} />
      <input type="hidden" name="opportunity_id" value={oppId} />
      {Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
    </>
  );

  return (
    <div className="space-y-10">
      {sp.saved ? <FormMessage tone="success">Opportunity saved.</FormMessage> : null}
      {sp.error ? <FormMessage tone="error">{sp.error}</FormMessage> : null}
      {rosterErr ? <FormMessage tone="error">Couldn&apos;t load the roster.</FormMessage> : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">{opp.title}</h2>
          <p className="mt-1 text-ink-soft">
            <Badge>{opp.status}</Badge> {opp.starts_at ? formatDateTime(opp.starts_at, opp.timezone) : "Ongoing"}
          </p>
          <Link href={`/volunteer/${opp.id}`} className="mt-2 inline-block font-semibold text-teal-strong hover:underline">View public page</Link>
        </div>
        {isCoord ? (
          <div className="flex flex-wrap gap-2">
            <a href={`/api/org/${orgId}/opportunities/${oppId}/roster.csv`} className="inline-flex h-9 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold hover:border-ink">
              <Download className="h-4 w-4" aria-hidden="true" /> Roster and hours (CSV)
            </a>
            {opp.status === "published" ? (
              <form action={setOpportunityStatus}>{hidden({ status: "closed" })}<Button type="submit" size="sm" variant="secondary">Close sign-ups</Button></form>
            ) : opp.status === "closed" ? (
              <form action={setOpportunityStatus}>{hidden({ status: "published" })}<Button type="submit" size="sm" variant="secondary">Reopen sign-ups</Button></form>
            ) : null}
            {["published", "closed"].includes(opp.status) ? (
              <form action={setOpportunityStatus}>{hidden({ status: "completed" })}<Button type="submit" size="sm" variant="secondary">Mark completed</Button></form>
            ) : null}
            {opp.status !== "cancelled" && opp.status !== "completed" ? (
              <form action={setOpportunityStatus}>{hidden({ status: "cancelled" })}<Button type="submit" size="sm" variant="ghost" className="text-danger">Cancel</Button></form>
            ) : null}
          </div>
        ) : null}
      </div>

      {isCoord && unverified.length ? (
        <form action={verifyHours} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-marigold/40 bg-marigold-wash p-4">
          {hidden({})}
          {unverified.map((id) => <input key={id} type="hidden" name="hours_id" value={id} />)}
          <p><strong>{unverified.length}</strong> hour record{unverified.length > 1 ? "s" : ""} waiting for verification. Verified hours count toward public impact.</p>
          <Button type="submit" name="decision" value="verify">Verify all</Button>
        </form>
      ) : null}

      {isCoord ? (
        groups.map(([title, list]) =>
          list.length ? (
            <section key={title} aria-label={title}>
              <h3 className="text-xl font-semibold">{title} <span className="text-base font-normal text-ink-muted">({list.length})</span></h3>
              <ul className="mt-3 divide-y divide-line rounded-[var(--radius-md)] border border-line bg-surface">
                {list.map((r) => {
                  const h = hoursByApp.get(r.application_id);
                  return (
                    <li key={r.application_id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold">{r.display_name} {!r.is_adult ? <Badge tone="warn">Under 18</Badge> : null}</p>
                        <p className="break-all text-sm text-ink-muted">{r.email}{r.shift_id ? `, ${shiftLabel(r.shift_id)}` : ""}</p>
                        {!r.is_adult ? <p className="text-sm text-ink-muted">Guardian: {r.guardian_name} ({r.guardian_email})</p> : null}
                        {r.hours !== null ? <p className="text-sm">{formatNumber(r.hours, 2)} h, {r.hours_status === "verified" ? "verified" : r.hours_status === "rejected" ? "rejected" : "not yet verified"}</p> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {r.status === "pending" || r.status === "waitlisted" ? (
                          <form action={decideApplication} className="flex gap-2">
                            {hidden({ application_id: r.application_id })}
                            <Button type="submit" name="decision" value="approve" size="sm">Confirm</Button>
                            {r.status === "pending" ? <Button type="submit" name="decision" value="decline" size="sm" variant="secondary">Decline</Button> : null}
                          </form>
                        ) : null}
                        {["approved", "completed", "no_show"].includes(r.status) ? (
                          <form action={recordAttendance} className="flex flex-wrap items-center gap-2">
                            {hidden({ application_id: r.application_id })}
                            <label className="sr-only" htmlFor={`h-${r.application_id}`}>Hours for {r.display_name}</label>
                            <input id={`h-${r.application_id}`} name="hours" type="number" min="0.25" max="24" step="0.25" defaultValue={r.hours ?? ""} placeholder="Hours" className="h-9 w-24 rounded-[8px] border border-line-strong px-2" />
                            <Button type="submit" name="attended" value="yes" size="sm" variant="secondary">Attended</Button>
                            <Button type="submit" name="attended" value="no" size="sm" variant="ghost">Absent</Button>
                          </form>
                        ) : null}
                        {h && h.status === "recorded" ? (
                          <form action={verifyHours} className="flex gap-1">
                            {hidden({ hours_id: h.id })}
                            <Button type="submit" name="decision" value="verify" size="sm">Verify</Button>
                            <Button type="submit" name="decision" value="reject" size="sm" variant="ghost">Reject</Button>
                          </form>
                        ) : null}
                        {["approved", "pending", "waitlisted"].includes(r.status) ? (
                          <form action={removeVolunteer}>
                            {hidden({ application_id: r.application_id })}
                            <Button type="submit" size="sm" variant="ghost" className="text-danger">Remove</Button>
                          </form>
                        ) : null}
                        <Link href={`/inbox/new?to_user=${r.user_id}&from_org=${orgId}`} className="grid h-9 w-9 place-items-center rounded-full hover:bg-ink/5" aria-label={`Message ${r.display_name}`}>
                          <MessageSquare className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null,
        )
      ) : (
        <p className="text-ink-muted">Coordinators can see and manage the volunteer roster.</p>
      )}
      {isCoord && !rows.length ? <p className="text-ink-muted">No one has signed up yet.</p> : null}

      {isCoord ? (
        <section aria-labelledby="shifts">
          <h3 id="shifts" className="text-xl font-semibold">Shifts</h3>
          <p className="mt-1 text-sm text-ink-muted">Optional. With shifts, volunteers choose one and each shift has its own capacity.</p>
          {shifts.length ? (
            <ul className="mt-3 divide-y divide-line rounded-[var(--radius-md)] border border-line bg-surface">
              {shifts.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 p-4">
                  <span>{s.label ? <strong>{s.label}: </strong> : null}{formatDateTime(s.starts_at, opp.timezone)} to {formatDateTime(s.ends_at, opp.timezone)}, {s.capacity} spots, {rows.filter((r) => r.shift_id === s.id && r.status === "approved").length} confirmed</span>
                  <form action={deleteShift}>{hidden({ shift_id: s.id })}<Button type="submit" size="sm" variant="ghost" className="text-danger">Delete</Button></form>
                </li>
              ))}
            </ul>
          ) : null}
          <form action={addShift} className="mt-4 grid gap-3 rounded-[var(--radius-md)] border border-line bg-surface p-4 sm:grid-cols-[1fr_1fr_1fr_100px_auto] sm:items-end">
            {hidden({ timezone: opp.timezone })}
            <label className="flex flex-col gap-1 text-sm font-semibold">Label<input name="label" maxLength={80} placeholder="Morning" className="h-11 rounded-[10px] border border-line-strong px-3 font-normal" /></label>
            <label className="flex flex-col gap-1 text-sm font-semibold">Starts<input type="datetime-local" name="starts_at" required className="h-11 rounded-[10px] border border-line-strong px-3 font-normal" /></label>
            <label className="flex flex-col gap-1 text-sm font-semibold">Ends<input type="datetime-local" name="ends_at" required className="h-11 rounded-[10px] border border-line-strong px-3 font-normal" /></label>
            <label className="flex flex-col gap-1 text-sm font-semibold">Spots<input type="number" name="capacity" min={1} required defaultValue={5} className="h-11 rounded-[10px] border border-line-strong px-3 font-normal" /></label>
            <Button type="submit" variant="secondary">Add shift</Button>
          </form>
        </section>
      ) : null}

      {isCoord && !["completed", "cancelled"].includes(opp.status) ? (
        <section aria-labelledby="edit">
          <h3 id="edit" className="text-xl font-semibold">Edit opportunity</h3>
          <div className="mt-4 max-w-3xl rounded-[var(--radius-lg)] border border-line bg-surface p-6 sm:p-8">
            <OpportunityForm
              orgId={orgId}
              canPublish={org.status === "approved"}
              opp={{ ...opp, starts_local: utcToZonedLocal(opp.starts_at, opp.timezone), ends_local: utcToZonedLocal(opp.ends_at, opp.timezone) }}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
