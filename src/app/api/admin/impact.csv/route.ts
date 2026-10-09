import { getCurrentUser, getSupabase } from "@/lib/supabase/server";
import { csvResponse, toCsv } from "@/lib/csv";
import { fetchAll } from "@/lib/fetch-all";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user?.platformRole) return new Response("Forbidden", { status: 403 });
  const supabase = (await getSupabase())!;
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  let data: unknown[];
  try {
    data = await fetchAll((a, b) => {
      let q = supabase.from("impact_records").select("occurred_at, metric, quantity, unit, verification, source_type, method_note, resource_category, organizations(name)").eq("is_demo", false).order("occurred_at").order("id");
      if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) q = q.gte("occurred_at", from);
      if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) q = q.lt("occurred_at", to);
      return q.range(a, b);
    });
  } catch {
    return new Response("Could not load", { status: 500 });
  }
  type R = { occurred_at: string; metric: string; quantity: number; unit: string; verification: string; source_type: string; method_note: string | null; resource_category: string | null; organizations: { name: string } | null };
  const rows = (data as unknown as R[]).map((r) => [r.occurred_at.slice(0, 10), r.organizations?.name ?? "", r.metric, Number(r.quantity), r.unit, r.verification, r.source_type, r.resource_category ?? "", r.method_note ?? ""]);
  return csvResponse("platform-impact.csv", toCsv(["Date", "Organization", "Metric", "Quantity", "Unit", "Verification", "Source", "Category", "Method"], rows));
}
