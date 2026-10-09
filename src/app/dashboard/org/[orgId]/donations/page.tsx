import Link from "next/link";
import { CreditCard, ExternalLink } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { setCampaignStatus } from "@/app/actions/org-misc";
import { requireOrg } from "@/lib/auth";
import { isStripeConfigured } from "@/lib/stripe";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CampaignForm } from "./campaign-form";

export default async function OrgDonations({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ error?: string; connected?: string; edit?: string }> }) {
  const { orgId } = await params;
  const sp = await searchParams;
  const { org, supabase } = await requireOrg(orgId, "admin");
  const [{ data: acct }, { data: campaigns }, { data: donations }, { data: canFundraise }] = await Promise.all([
    supabase.from("org_payment_accounts").select("charges_enabled, payouts_enabled, details_submitted, requirements_due, livemode").eq("org_id", orgId).maybeSingle(),
    supabase.from("fundraising_campaigns").select("id, slug, title, summary, story, status, goal_cents, ends_at, allow_recurring, cover_path, created_at").eq("org_id", orgId).order("created_at", { ascending: false }),
    supabase.rpc("org_donations", { p_org: orgId, p_limit: 100, p_offset: 0 }),
    supabase.rpc("org_can_fundraise", { p_org: orgId }),
  ]);
  const progress = await Promise.all((campaigns ?? []).map(async (c) => (await supabase.rpc("campaign_progress", { p_campaign: c.id })).data?.[0] ?? { raised_cents: 0, donor_count: 0 }));
  type D = { id: string; donor_display: string; donor_email: string | null; amount_cents: number; refunded_cents: number; status: string; is_recurring: boolean; receipt_number: string | null; created_at: string };
  const editing = (campaigns ?? []).find((c) => c.id === sp.edit);
  const stripeReady = isStripeConfigured();
  const verified = org.verification_level !== "unverified" && org.status === "approved";

  return (
    <div className="space-y-10">
      {sp.error ? <FormMessage tone="error">{sp.error}</FormMessage> : null}
      {sp.connected ? <FormMessage tone="success">Payment account updated. Stripe may take a few minutes to finish reviewing your details.</FormMessage> : null}

      <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold"><CreditCard className="h-5 w-5" aria-hidden="true" /> Payment account</h2>
        {!stripeReady ? (
          <p className="mt-2 text-ink-soft">Online payments aren&apos;t enabled on this platform yet. The platform administrator needs to finish Stripe setup first.</p>
        ) : !verified ? (
          <p className="mt-2 text-ink-soft">Your organization needs to be approved and verified before it can receive payments. <Link href={`/dashboard/org/${orgId}/verification`} className="font-semibold text-teal-strong underline">Go to verification</Link>.</p>
        ) : acct?.charges_enabled ? (
          <div className="mt-2 space-y-3">
            <p className="text-ink-soft">Connected through Stripe. Donations and ticket sales are deposited to your organization&apos;s bank account by Stripe.</p>
            <div className="flex flex-wrap gap-2">
              <Badge tone="teal">Accepting payments</Badge>
              <Badge tone={acct.payouts_enabled ? "teal" : "warn"}>{acct.payouts_enabled ? "Payouts on" : "Payouts pending"}</Badge>
              {!acct.livemode ? <Badge tone="warn">Test mode</Badge> : null}
            </div>
            <a href={`/api/stripe/connect/dashboard?org=${orgId}`} className="inline-flex items-center gap-1 font-semibold text-teal-strong underline">Open Stripe dashboard <ExternalLink className="h-4 w-4" aria-hidden="true" /></a>
          </div>
        ) : (
          <div className="mt-2 space-y-3">
            <p className="text-ink-soft">{acct ? "Stripe needs more information before you can accept payments." : "Connect a Stripe account to receive donations and sell event tickets. Stripe collects your bank and identity details directly; we never see them."}</p>
            {acct?.requirements_due?.length ? <p className="text-sm text-warn">Outstanding: {acct.requirements_due.slice(0, 5).join(", ")}</p> : null}
            <LinkButton href={`/api/stripe/connect?org=${orgId}`}>{acct ? "Continue Stripe setup" : "Connect with Stripe"}</LinkButton>
          </div>
        )}
      </section>

      <section className="grid gap-8 lg:grid-cols-[1fr_400px]">
        <div>
          <h2 className="text-2xl font-semibold">Campaigns</h2>
          {(campaigns ?? []).length ? (
            <ul className="mt-4 space-y-3">
              {(campaigns ?? []).map((c, i) => (
                <li key={c.id} className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{c.title}</p>
                      <p className="text-sm text-ink-muted">{formatCurrency(Number(progress[i]?.raised_cents ?? 0))} raised{c.goal_cents ? ` of ${formatCurrency(c.goal_cents)}` : ""}, {progress[i]?.donor_count ?? 0} donors</p>
                    </div>
                    <Badge tone={c.status === "active" ? "teal" : c.status === "pending_review" ? "warn" : "neutral"}>{c.status.replace("_", " ")}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {["draft", "pending_review"].includes(c.status) ? <LinkButton href={`?edit=${c.id}`} size="sm" variant="secondary">Edit</LinkButton> : null}
                    {c.status === "active" ? <Link href={`/campaigns/${c.slug}`} className="inline-flex h-9 items-center px-3 text-sm font-semibold text-teal-strong underline">View page</Link> : null}
                    {c.status === "active" ? <form action={setCampaignStatus}><input type="hidden" name="org_id" value={orgId} /><input type="hidden" name="campaign_id" value={c.id} /><input type="hidden" name="status" value="paused" /><Button type="submit" size="sm" variant="secondary">Pause</Button></form> : null}
                    {c.status === "paused" ? <form action={setCampaignStatus}><input type="hidden" name="org_id" value={orgId} /><input type="hidden" name="campaign_id" value={c.id} /><input type="hidden" name="status" value="active" /><Button type="submit" size="sm" variant="secondary">Resume</Button></form> : null}
                    {["active", "paused"].includes(c.status) ? <form action={setCampaignStatus}><input type="hidden" name="org_id" value={orgId} /><input type="hidden" name="campaign_id" value={c.id} /><input type="hidden" name="status" value="completed" /><Button type="submit" size="sm" variant="ghost">End campaign</Button></form> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-ink-muted">No campaigns yet.</p>
          )}
        </div>
        <aside className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
          <h3 className="text-lg font-semibold">{editing ? "Edit campaign" : "New campaign"}</h3>
          <p className="mt-1 text-sm text-ink-muted">Campaigns go live after platform review{canFundraise ? "" : ", and once your payment account is connected"}.</p>
          <CampaignForm orgId={orgId} campaign={editing} />
        </aside>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold">Donations</h2>
          <a href={`/api/org/${orgId}/donations.csv`} className="text-sm font-semibold text-teal-strong underline">Download CSV</a>
        </div>
        {(donations ?? []).length ? (
          <div className="mt-4 overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface">
            <table className="w-full min-w-[640px] text-left">
              <thead className="border-b border-line text-sm text-ink-muted"><tr><th className="p-3">Date</th><th className="p-3">Donor</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">Receipt</th></tr></thead>
              <tbody className="divide-y divide-line">
                {((donations ?? []) as D[]).map((d) => (
                  <tr key={d.id}>
                    <td className="p-3 text-sm">{formatDate(d.created_at)}</td>
                    <td className="p-3"><p>{d.donor_display}</p>{d.donor_email ? <p className="text-sm text-ink-muted">{d.donor_email}</p> : null}</td>
                    <td className="p-3 font-semibold">{formatCurrency(d.amount_cents - d.refunded_cents)}{d.is_recurring ? <span className="text-sm font-normal text-ink-muted"> recurring</span> : null}</td>
                    <td className="p-3"><Badge tone={d.status === "succeeded" ? "teal" : d.status.includes("refund") ? "warn" : "neutral"}>{d.status.replace("_", " ")}</Badge></td>
                    <td className="p-3 text-sm">{d.receipt_number ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-ink-muted">No donations yet.</p>
        )}
        <p className="mt-4 text-sm text-ink-muted">Refunds are issued from your Stripe dashboard and appear here automatically. Donor names are hidden when the donor chose to give anonymously.</p>
      </section>
    </div>
  );
}
