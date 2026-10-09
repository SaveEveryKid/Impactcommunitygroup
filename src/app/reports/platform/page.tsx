import type { Metadata } from "next";
import { ImpactReport, type ReportRow } from "@/components/impact-report";
import { PrintButton } from "@/components/print-button";
import { requirePlatformStaff } from "@/lib/auth";
import { brandName } from "@/lib/env";

export const metadata: Metadata = { title: "Platform impact report", robots: { index: false } };

export default async function PlatformReport({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requirePlatformStaff();
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : null;
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : null;
  const [{ data }, { count: orgs }] = await Promise.all([
    supabase.rpc("platform_impact_summary", { p_from: from, p_to: to }),
    supabase.from("organizations").select("id", { count: "exact", head: true }).eq("status", "approved").eq("is_demo", false),
  ]);
  const rows: ReportRow[] = [
    { metric: "organizations_registered", unit: "", verification: "verified", total: orgs ?? 0, records: orgs ?? 0 },
    ...((data ?? []) as ReportRow[]).map((r) => ({ ...r, total: Number(r.total) })),
  ];
  return (
    <div className="bg-paper py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-6 flex max-w-3xl justify-end px-4 print:hidden"><PrintButton /></div>
      <ImpactReport title={brandName} subtitle="Network-wide impact" rows={rows} from={from} to={to} />
    </div>
  );
}
