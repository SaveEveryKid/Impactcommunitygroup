import Link from "next/link";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { deleteManualImpact } from "@/app/actions/org-misc";
import { requireOrg, roleAtLeast } from "@/lib/auth";
import { IMPACT_METRIC_LABEL } from "@/lib/constants";
import { formatDate, formatNumber } from "@/lib/utils";
import { ManualImpactForm } from "./manual-form";

type Summary = { metric: string; verification: string; unit: string; total: number; records: number };

export default async function OrgImpact({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const { orgId } = await params;
  const sp = await searchParams;
  const { role, supabase } = await requireOrg(orgId);
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : null;
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : null;
  const [{ data: summary }, { data: manual }] = await Promise.all([
    supabase.rpc("org_impact_summary", { p_org: orgId, p_from: from, p_to: to }),
    supabase.from("impact_records").select("id, metric, quantity, unit, verification, method_note, occurred_at").eq("org_id", orgId).eq("source_type", "manual").order("occurred_at", { ascending: false }).limit(50),
  ]);
  const rows = (summary ?? []) as Summary[];
  const qs = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
  const Table = ({ title, list, note }: { title: string; list: Summary[]; note: string }) => (
    <section>
      <h3 className="text-xl font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-ink-muted">{note}</p>
      {list.length ? (
        <dl className="mt-4 grid gap-px overflow-hidden rounded-[var(--radius-lg)] border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r) => (
            <div key={`${r.metric}-${r.unit}-${r.verification}`} className="bg-surface p-5">
              <dt className="text-sm text-ink-muted">{r.metric === "donation_processed" ? "Donations received" : (IMPACT_METRIC_LABEL[r.metric]?.label ?? r.metric)}</dt>
              <dd className="font-display text-3xl font-bold">{r.metric === "donation_processed" ? `$${formatNumber(r.total, 2)}` : formatNumber(r.total, 1)} <span className="text-base font-normal text-ink-muted">{r.metric === "donation_processed" ? "" : r.unit}</span></dd>
              <dd className="text-sm text-ink-muted">{r.records} record{Number(r.records) === 1 ? "" : "s"}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-ink-muted">Nothing recorded in this period.</p>
      )}
    </section>
  );
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="flex flex-col gap-1 text-sm font-semibold">From<input type="date" name="from" defaultValue={from ?? ""} className="h-11 rounded-[10px] border border-line-strong px-3 font-normal" /></label>
          <label className="flex flex-col gap-1 text-sm font-semibold">Before<input type="date" name="to" defaultValue={to ?? ""} className="h-11 rounded-[10px] border border-line-strong px-3 font-normal" /></label>
          <Button type="submit" variant="secondary">Apply</Button>
        </form>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/org/${orgId}/impact.csv${qs ? `?${qs}` : ""}`} className="inline-flex h-11 items-center gap-2 rounded-full border border-line-strong bg-surface px-5 font-semibold hover:border-ink"><Download className="h-4 w-4" aria-hidden="true" /> CSV</a>
          <Link href={`/reports/org/${orgId}${qs ? `?${qs}` : ""}`} className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 font-semibold text-white hover:bg-ink/90"><Printer className="h-4 w-4" aria-hidden="true" /> Funder report (PDF)</Link>
        </div>
      </div>
      <Table title="Verified" list={rows.filter((r) => r.verification === "verified")} note="Confirmed inside the platform by a counter-party or coordinator." />
      <Table title="Self-reported and estimated" list={rows.filter((r) => r.verification !== "verified")} note="Entered by your team. Always labelled and never added to verified totals." />
      {roleAtLeast(role, "coordinator") ? (
        <section className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
            <h3 className="text-lg font-semibold">Record work done outside the platform</h3>
            <ManualImpactForm orgId={orgId} />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Your manual entries</h3>
            <ul className="mt-3 divide-y divide-line rounded-[var(--radius-md)] border border-line bg-surface">
              {(manual ?? []).map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-3 p-4">
                  <div>
                    <p className="font-semibold">{formatNumber(m.quantity, 1)} {m.unit}, {IMPACT_METRIC_LABEL[m.metric]?.label ?? m.metric}</p>
                    <p className="text-sm text-ink-muted">{formatDate(m.occurred_at)} <Badge>{m.verification.replace("_", "-")}</Badge></p>
                    <p className="text-sm text-ink-soft">{m.method_note}</p>
                  </div>
                  {roleAtLeast(role, "admin") ? (
                    <form action={deleteManualImpact}><input type="hidden" name="org_id" value={orgId} /><input type="hidden" name="record_id" value={m.id} /><Button type="submit" size="sm" variant="ghost" className="text-danger">Delete</Button></form>
                  ) : null}
                </li>
              ))}
              {!manual?.length ? <li className="p-4 text-ink-muted">None yet.</li> : null}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}
