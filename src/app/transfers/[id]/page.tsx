import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Circle, MessageSquare } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Badge, Container } from "@/components/ui/misc";
import { scheduleTransfer, transitionTransfer } from "@/app/actions/resources";
import { requireUser } from "@/lib/auth";
import { getMyMemberships, getSupabase } from "@/lib/supabase/server";
import { formatDateTime, formatNumber, utcToZonedLocal } from "@/lib/utils";

export const metadata: Metadata = { title: "Resource transfer", robots: { index: false } };

const STEPS = ["reserved", "scheduled", "collected", "delivered", "completed"] as const;
const STEP_LABEL: Record<string, string> = {
  reserved: "Reserved",
  scheduled: "Pickup scheduled",
  collected: "Picked up",
  delivered: "Delivered",
  completed: "Receipt confirmed",
};

export default async function TransferPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireUser(`/transfers/${id}`);
  const supabase = (await getSupabase())!;
  const { data: t } = await supabase
    .from("resource_transfers")
    .select("*, resources(id, title, kind, handling_requirements, is_perishable, expires_at), from_org:from_org_id(id, name, slug), to_org:to_org_id(id, name, slug), volunteer:volunteer_user_id(display_name)")
    .eq("id", id)
    .maybeSingle();
  if (!t) notFound();
  const memberships = await getMyMemberships();
  const coordIn = (orgId: string) => memberships.some((m) => m.org_id === orgId && ["owner", "admin", "coordinator"].includes(m.role));
  const giver = coordIn(t.from_org.id);
  const receiver = coordIn(t.to_org.id);
  const isVolunteer = t.volunteer_user_id === user.id;

  const [{ data: priv }, { data: events }, { data: conv }, { data: team }] = await Promise.all([
    supabase.from("resource_private_details").select("pickup_address, contact_name, contact_phone, access_notes").eq("resource_id", t.resource_id).maybeSingle(),
    supabase.from("resource_transfer_events").select("id, from_status, to_status, note, created_at, profiles:actor_id(display_name)").eq("transfer_id", id).order("created_at"),
    supabase.from("conversations").select("id").eq("resource_transfer_id", id).maybeSingle(),
    giver || receiver
      ? supabase.from("organization_members").select("user_id, org_id, profiles(display_name)").in("org_id", [t.from_org.id, t.to_org.id])
      : Promise.resolve({ data: [] }),
  ]);
  type Ev = { id: number; from_status: string | null; to_status: string; note: string | null; created_at: string; profiles: { display_name: string } | null };
  type Member = { user_id: string; org_id: string; profiles: { display_name: string } | null };

  const statusIdx = STEPS.indexOf(t.status as (typeof STEPS)[number]);
  const terminal = ["completed", "cancelled"].includes(t.status);

  const actions: { to: string; label: string; variant?: "primary" | "secondary" | "danger"; needsNote?: boolean }[] = [];
  if (["reserved", "scheduled"].includes(t.status) && (giver || receiver || isVolunteer)) actions.push({ to: "collected", label: "Mark picked up" });
  if (t.status === "collected" && (receiver || isVolunteer)) actions.push({ to: "delivered", label: "Mark delivered" });
  if (["collected", "delivered"].includes(t.status) && receiver) actions.push({ to: "completed", label: "Confirm receipt" });
  if (t.status === "problem" && (giver || receiver)) actions.push({ to: "scheduled", label: "Resume (rescheduled)", variant: "secondary" });

  return (
    <Container className="max-w-4xl py-10">
      <Link href={`/dashboard/org/${giver ? t.from_org.id : receiver ? t.to_org.id : ""}/transfers`} className="font-semibold text-teal-strong hover:underline">
        All transfers
      </Link>
      <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{t.resources.title}</h1>
      <p className="mt-2 text-lg text-ink-soft">
        {formatNumber(t.quantity, 2)} {t.unit} from <Link href={`/organizations/${t.from_org.slug}`} className="font-semibold underline">{t.from_org.name}</Link> to{" "}
        <Link href={`/organizations/${t.to_org.slug}`} className="font-semibold underline">{t.to_org.name}</Link>
      </p>
      {error ? <div className="mt-6"><FormMessage tone="error">{error}</FormMessage></div> : null}
      {t.status === "cancelled" ? <div className="mt-6"><FormMessage tone="info">This transfer was cancelled. The reserved quantity went back to the listing.</FormMessage></div> : null}
      {t.status === "problem" ? <div className="mt-6"><FormMessage tone="error">A problem was reported: {t.problem_note}</FormMessage></div> : null}

      <ol className="mt-8 grid gap-3 sm:grid-cols-5" aria-label="Transfer progress">
        {STEPS.map((s, i) => {
          const done = t.status !== "cancelled" && statusIdx >= i;
          return (
            <li key={s} className={`flex items-center gap-2 rounded-[12px] border p-3 ${done ? "border-teal bg-teal-wash" : "border-line bg-surface"}`} aria-current={statusIdx === i ? "step" : undefined}>
              {done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-teal" aria-hidden="true" /> : <Circle className="h-5 w-5 shrink-0 text-ink-muted" aria-hidden="true" />}
              <span className="text-sm font-semibold">{STEP_LABEL[s]}</span>
            </li>
          );
        })}
      </ol>

      <div className="mt-10 grid gap-8 md:grid-cols-2">
        <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
          <h2 className="text-lg font-semibold">Pickup</h2>
          <dl className="mt-3 space-y-2">
            <div><dt className="text-sm text-ink-muted">Window</dt><dd>{t.pickup_window_start ? `${formatDateTime(t.pickup_window_start)}${t.pickup_window_end ? ` to ${formatDateTime(t.pickup_window_end)}` : ""}` : "Not scheduled yet"}</dd></div>
            <div><dt className="text-sm text-ink-muted">Volunteer driver</dt><dd>{t.volunteer?.display_name ?? "None assigned"}</dd></div>
            {priv && !terminal ? (
              <>
                {priv.pickup_address ? <div><dt className="text-sm text-ink-muted">Address</dt><dd className="font-semibold">{priv.pickup_address}</dd></div> : null}
                {priv.contact_name || priv.contact_phone ? <div><dt className="text-sm text-ink-muted">On-site contact</dt><dd>{priv.contact_name} {priv.contact_phone ? <a href={`tel:${priv.contact_phone}`} className="underline">{priv.contact_phone}</a> : null}</dd></div> : null}
                {priv.access_notes ? <div><dt className="text-sm text-ink-muted">Notes</dt><dd>{priv.access_notes}</dd></div> : null}
              </>
            ) : null}
          </dl>
          {t.resources.handling_requirements ? <p className="mt-4 rounded-[10px] bg-warn-wash p-3 text-sm text-warn">Handling: {t.resources.handling_requirements}</p> : null}
        </section>

        <section className="space-y-4">
          {actions.length && !terminal ? (
            <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
              <h2 className="text-lg font-semibold">Next step</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {actions.map((a) => (
                  <form key={a.to} action={transitionTransfer}>
                    <input type="hidden" name="transfer_id" value={t.id} />
                    <input type="hidden" name="to" value={a.to} />
                    <Button type="submit" variant={a.variant ?? "primary"}>{a.label}</Button>
                  </form>
                ))}
              </div>
            </div>
          ) : null}

          {(giver || receiver) && ["reserved", "scheduled", "problem"].includes(t.status) ? (
            <details className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
              <summary className="cursor-pointer text-lg font-semibold">Schedule pickup or assign a driver</summary>
              <form action={scheduleTransfer} className="mt-4 flex flex-col gap-3">
                <input type="hidden" name="transfer_id" value={t.id} />
                <input type="hidden" name="timezone" value="America/Chicago" />
                <label className="flex flex-col gap-1 text-sm font-semibold">Window start (Central)
                  <input type="datetime-local" name="window_start" required defaultValue={utcToZonedLocal(t.pickup_window_start)} className="h-11 rounded-[10px] border border-line-strong px-3 font-normal" />
                </label>
                <label className="flex flex-col gap-1 text-sm font-semibold">Window end
                  <input type="datetime-local" name="window_end" defaultValue={utcToZonedLocal(t.pickup_window_end)} className="h-11 rounded-[10px] border border-line-strong px-3 font-normal" />
                </label>
                <label className="flex flex-col gap-1 text-sm font-semibold">Volunteer driver
                  <select name="volunteer_user_id" defaultValue={t.volunteer_user_id ?? ""} className="h-11 rounded-[10px] border border-line-strong px-3 font-normal">
                    <option value="">None</option>
                    {((team ?? []) as unknown as Member[]).map((m) => (
                      <option key={`${m.org_id}-${m.user_id}`} value={m.user_id}>{m.profiles?.display_name ?? "Member"} ({m.org_id === t.from_org.id ? t.from_org.name : t.to_org.name})</option>
                    ))}
                  </select>
                </label>
                <Button type="submit" variant="secondary">Save schedule</Button>
              </form>
            </details>
          ) : null}

          {!terminal && (giver || receiver || isVolunteer) ? (
            <details className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
              <summary className="cursor-pointer text-lg font-semibold">Report a problem or cancel</summary>
              <form action={transitionTransfer} className="mt-4 flex flex-col gap-3">
                <input type="hidden" name="transfer_id" value={t.id} />
                <label className="flex flex-col gap-1 text-sm font-semibold">What happened?
                  <textarea name="note" rows={3} maxLength={2000} className="rounded-[10px] border border-line-strong p-3 font-normal" />
                </label>
                <div className="flex flex-wrap gap-2">
                  {t.status !== "problem" ? <Button type="submit" name="to" value="problem" variant="secondary">Report problem</Button> : null}
                  {(giver || receiver) && ["reserved", "scheduled", "problem"].includes(t.status) ? <Button type="submit" name="to" value="cancelled" variant="danger">Cancel transfer</Button> : null}
                </div>
              </form>
            </details>
          ) : null}

          <LinkButton
            href={conv ? `/inbox/${conv.id}` : `/inbox/new?transfer=${t.id}&to_org=${giver ? t.to_org.id : t.from_org.id}${giver ? `&from_org=${t.from_org.id}` : receiver ? `&from_org=${t.to_org.id}` : ""}`}
            variant="secondary"
            className="w-full"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            {conv ? "Open conversation" : "Message the other organization"}
          </LinkButton>
        </section>
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">History</h2>
        <ol className="mt-3 space-y-3 border-l-2 border-line pl-5">
          {((events ?? []) as unknown as Ev[]).map((e) => (
            <li key={e.id}>
              <p className="font-semibold capitalize">{e.to_status} <Badge className="ml-1">{formatDateTime(e.created_at)}</Badge></p>
              <p className="text-sm text-ink-muted">by {e.profiles?.display_name ?? "system"}{e.note ? `: ${e.note}` : ""}</p>
            </li>
          ))}
        </ol>
      </section>
    </Container>
  );
}
