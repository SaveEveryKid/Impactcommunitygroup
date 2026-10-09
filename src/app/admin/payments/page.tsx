import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { decideCampaign } from "@/app/actions/admin";
import { requirePlatformStaff } from "@/lib/auth";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default async function AdminPayments({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requirePlatformStaff("admin");
  const [{ data: pending }, { data: donations }, { data: failed }, { data: totals }] = await Promise.all([
    supabase.from("fundraising_campaigns").select("id, slug, title, summary, goal_cents, created_at, org_id, organizations(name, slug, verification_level)").eq("status", "pending_review").order("created_at"),
    supabase.from("donations").select("id, amount_cents, refunded_cents, status, is_recurring, created_at, livemode, receipt_number, organizations(name), fundraising_campaigns(title)").order("created_at", { ascending: false }).limit(50),
    supabase.from("stripe_events").select("id, type, error, received_at").not("error", "is", null).is("processed_at", null).order("received_at", { ascending: false }).limit(20),
    supabase.rpc("platform_payment_totals"),
  ]);
  const sum = (kind: string, live: boolean) => ((totals ?? []) as { kind: string; livemode: boolean; total_cents: number }[]).filter((t) => t.kind === kind && t.livemode === live).reduce((a, t) => a + Number(t.total_cents), 0);
  type Pend = { id: string; slug: string; title: string; summary: string | null; goal_cents: number | null; created_at: string; org_id: string | null; organizations: { name: string; slug: string; verification_level: string } | null };
  type Don = { id: string; amount_cents: number; refunded_cents: number; status: string; is_recurring: boolean; created_at: string; livemode: boolean; receipt_number: string | null; organizations: { name: string } | null; fundraising_campaigns: { title: string } | null };
  return (
    <div className="space-y-10">
      {sp.error ? <FormMessage tone="error">{sp.error}</FormMessage> : null}
      <section>
        <h2 className="text-2xl font-semibold">Reconciliation</h2>
        <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-line bg-line sm:grid-cols-4">
          {[["Donations (live)", sum("donation", true)], ["Tickets (live)", sum("event_ticket", true)], ["Refunds (live)", sum("refund", true)], ["Test-mode volume", sum("donation", false) + sum("event_ticket", false)]].map(([l, v]) => (
            <div key={String(l)} className="bg-surface p-5"><dt className="text-sm text-ink-muted">{l}</dt><dd className="font-display text-2xl font-bold">{formatCurrency(Number(v))}</dd></div>
          ))}
        </dl>
        <p className="mt-2 text-sm text-ink-muted">Totals come from the payment ledger recorded by verified Stripe webhooks. Compare against the Stripe dashboard balance report monthly.</p>
      </section>
      {failed?.length ? (
        <section>
          <h2 className="text-xl font-semibold text-danger">Payment events that failed to process</h2>
          <p className="text-sm text-ink-muted">Stripe retries automatically for up to three days. Persistent failures need a developer.</p>
          <ul className="mt-3 divide-y divide-line rounded-[var(--radius-md)] border border-danger/30 bg-surface">
            {failed.map((f) => <li key={f.id} className="p-3 text-sm"><strong>{f.type}</strong> {f.id}, {formatDateTime(f.received_at)}: {f.error}</li>)}
          </ul>
        </section>
      ) : null}
      <section>
        <h2 className="text-2xl font-semibold">Campaigns awaiting approval</h2>
        {!pending?.length ? <p className="mt-3 text-ink-muted">None.</p> : null}
        <ul className="mt-4 space-y-3">
          {((pending ?? []) as unknown as Pend[]).map((c) => (
            <li key={c.id} className="rounded-[var(--radius-md)] border border-line bg-surface p-5">
              <p className="font-semibold">{c.title}</p>
              <p className="text-sm text-ink-muted">{c.organizations ? <Link href={`/organizations/${c.organizations.slug}`} className="underline">{c.organizations.name}</Link> : "Platform campaign"}{c.goal_cents ? `, goal ${formatCurrency(c.goal_cents)}` : ""}</p>
              {c.summary ? <p className="mt-2 text-ink-soft">{c.summary}</p> : null}
              <form action={decideCampaign} className="mt-3 flex flex-wrap gap-2">
                <input type="hidden" name="campaign_id" value={c.id} />
                <input name="note" placeholder="Note (optional)" aria-label="Note" className="h-9 flex-1 rounded-[8px] border border-line-strong px-2" />
                <Button type="submit" name="decision" value="approve" size="sm">Approve and publish</Button>
                <Button type="submit" name="decision" value="return" size="sm" variant="secondary">Return to draft</Button>
              </form>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-2xl font-semibold">Recent donations</h2>
        <div className="mt-4 overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-ink-muted"><tr><th className="p-3">Date</th><th className="p-3">Recipient</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">Receipt</th></tr></thead>
            <tbody className="divide-y divide-line">
              {((donations ?? []) as unknown as Don[]).map((d) => (
                <tr key={d.id}>
                  <td className="p-3">{formatDateTime(d.created_at)}</td>
                  <td className="p-3">{d.organizations?.name ?? "Platform"}{d.fundraising_campaigns ? <span className="text-ink-muted">, {d.fundraising_campaigns.title}</span> : null}</td>
                  <td className="p-3 font-semibold">{formatCurrency(d.amount_cents - d.refunded_cents)} {!d.livemode ? <Badge tone="warn">test</Badge> : null}{d.is_recurring ? <Badge>recurring</Badge> : null}</td>
                  <td className="p-3"><Badge tone={d.status === "succeeded" ? "teal" : "neutral"}>{d.status}</Badge></td>
                  <td className="p-3">{d.receipt_number ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
