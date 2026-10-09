import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { Container } from "@/components/ui/misc";
import { getCurrentUser, getSupabase } from "@/lib/supabase/server";
import { brandName } from "@/lib/env";
import { formatCurrency, formatDate } from "@/lib/utils";
import { LinkButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "Donation receipt", robots: { index: false } };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Container className="max-w-xl py-16">
        <h1 className="text-3xl font-bold">Your receipt</h1>
        <p className="mt-4 text-ink-soft">Stripe emailed a payment receipt to the address you gave at checkout. Sign in with that email to see your donation receipt here.</p>
        <LinkButton href={`/login?next=/give/receipt/${id}`} className="mt-6">Sign in</LinkButton>
      </Container>
    );
  }
  const supabase = (await getSupabase())!;
  // RLS: donors can only read their own donations.
  const { data: d } = await supabase.from("donations").select("*, organizations(name, ein_visible:verification_level), fundraising_campaigns(title)").eq("id", id).maybeSingle();
  if (!d) notFound();
  const recipient = d.organizations?.name ?? brandName;
  const verifiedExempt = d.organizations?.ein_visible === "tax_exempt_verified";
  return (
    <Container className="max-w-2xl py-12">
      <div className="mb-6 flex justify-end print:hidden"><PrintButton /></div>
      <article className="rounded-[var(--radius-lg)] border border-line bg-white p-8">
        <p className="font-semibold text-teal-strong">{brandName}</p>
        <h1 className="mt-2 text-3xl font-bold">Donation receipt</h1>
        {d.status === "pending" ? <p className="mt-4 rounded bg-warn-wash p-3 text-warn">This payment is still being confirmed. Refresh in a minute.</p> : null}
        <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
          <dt className="text-ink-muted">Receipt number</dt><dd className="font-semibold">{d.receipt_number ?? "Pending"}</dd>
          <dt className="text-ink-muted">Date</dt><dd>{formatDate(d.succeeded_at ?? d.created_at)}</dd>
          <dt className="text-ink-muted">Donor</dt><dd>{d.donor_name ?? user.displayName}</dd>
          <dt className="text-ink-muted">Recipient</dt><dd>{recipient}</dd>
          {d.fundraising_campaigns ? <><dt className="text-ink-muted">Campaign</dt><dd>{d.fundraising_campaigns.title}</dd></> : null}
          <dt className="text-ink-muted">Amount</dt><dd className="font-display text-2xl font-bold">{formatCurrency(d.amount_cents - d.refunded_cents)}</dd>
          {d.refunded_cents ? <><dt className="text-ink-muted">Refunded</dt><dd>{formatCurrency(d.refunded_cents)}</dd></> : null}
          <dt className="text-ink-muted">Type</dt><dd>{d.is_recurring ? `Recurring (${d.recurring_interval}ly)` : "One-time"}</dd>
          <dt className="text-ink-muted">Status</dt><dd className="capitalize">{d.status.replace("_", " ")}</dd>
        </dl>
        <p className="mt-8 border-t border-line pt-4 text-sm text-ink-muted">
          No goods or services were provided in exchange for this contribution.{" "}
          {verifiedExempt
            ? `${recipient}'s tax-exempt status was checked against IRS records by the platform. This receipt is not tax advice.`
            : `${recipient}'s tax-exempt status has not been verified by the platform; this gift may not be tax-deductible.`}
        </p>
      </article>
    </Container>
  );
}
