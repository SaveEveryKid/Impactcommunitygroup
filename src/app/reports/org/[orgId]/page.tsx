import type { Metadata } from "next";
import { ImpactReport, type ReportRow } from "@/components/impact-report";
import { PrintButton } from "@/components/print-button";
import { requireOrg } from "@/lib/auth";

export const metadata: Metadata = { title: "Impact report", robots: { index: false } };

export default async function OrgReport({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const { orgId } = await params;
  const sp = await searchParams;
  const { org, supabase } = await requireOrg(orgId);
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : null;
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : null;
  const { data } = await supabase.rpc("org_impact_summary", { p_org: orgId, p_from: from, p_to: to });
  return (
    <div className="bg-paper py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-6 flex max-w-3xl justify-end px-4 print:hidden"><PrintButton /></div>
      <ImpactReport title={org.name} subtitle="Organization impact on the network" rows={((data ?? []) as ReportRow[]).map((r) => ({ ...r, total: Number(r.total) }))} from={from} to={to} />
    </div>
  );
}
