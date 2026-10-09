import Link from "next/link";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requirePlatformStaff } from "@/lib/auth";
import { IMPACT_METRIC_LABEL } from "@/lib/constants";
import { formatNumber } from "@/lib/utils";

export default async function AdminImpact({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requirePlatformStaff();
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : null;
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : null;
  const { data } = await supabase.rpc("platform_impact_summary", { p_from: from, p_to: to });
  const rows = ((data ?? []) as { metric: string; unit: string; verification: string; total: number; records: number; organizations: number }[]).map((r) => ({ ...r, total: Number(r.total) }));
  const qs = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <form className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-semibold">From<input type="date" name="from" defaultValue={from ?? ""} className="h-10 rounded-[10px] border border-line-strong px-3 font-normal" /></label>
          <label className="flex flex-col gap-1 text-sm font-semibold">Before<input type="date" name="to" defaultValue={to ?? ""} className="h-10 rounded-[10px] border border-line-strong px-3 font-normal" /></label>
          <Button type="submit" variant="secondary" size="sm">Apply</Button>
        </form>
        <div className="flex gap-2">
          <a href={`/api/admin/impact.csv${qs ? `?${qs}` : ""}`} className="inline-flex h-11 items-center gap-2 rounded-full border border-line-strong bg-surface px-5 font-semibold"><Download className="h-4 w-4" aria-hidden="true" /> CSV</a>
          <Link href={`/reports/platform${qs ? `?${qs}` : ""}`} className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 font-semibold text-white"><Printer className="h-4 w-4" aria-hidden="true" /> Funder report (PDF)</Link>
        </div>
      </div>
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-surface">
        <table className="w-full min-w-[640px] text-left">
          <thead className="border-b border-line text-sm text-ink-muted"><tr><th className="p-3">Measure</th><th className="p-3">Basis</th><th className="p-3 text-right">Total</th><th className="p-3 text-right">Records</th><th className="p-3 text-right">Organizations</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={`${r.metric}${r.unit}${r.verification}`}>
                <td className="p-3 font-semibold">{r.metric === "donation_processed" ? "Donations processed" : (IMPACT_METRIC_LABEL[r.metric]?.label ?? r.metric)}</td>
                <td className="p-3">{r.verification.replace("_", "-")}</td>
                <td className="p-3 text-right font-display text-lg font-bold">{formatNumber(r.total, 2)} <span className="text-sm font-normal text-ink-muted">{r.metric === "donation_processed" ? r.unit.toUpperCase() : r.unit}</span></td>
                <td className="p-3 text-right">{r.records}</td>
                <td className="p-3 text-right">{r.organizations}</td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={5} className="p-4 text-ink-muted">No impact recorded in this period.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-ink-muted">Demonstration data is excluded. Each source record (transfer, hour record, event, partnership, payment) is counted once per measure.</p>
    </div>
  );
}
