import { getSupabase, getCurrentUser } from "@/lib/supabase/server";
import { csvResponse, toCsv } from "@/lib/csv";

export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const supabase = (await getSupabase())!;
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  // RLS limits impact_records to members of this organization.
  let q = supabase.from("impact_records").select("occurred_at, metric, quantity, unit, verification, method_note, source_type, resource_category").eq("org_id", orgId).order("occurred_at");
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) q = q.gte("occurred_at", from);
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) q = q.lt("occurred_at", to);
  const { data, error } = await q;
  if (error) return new Response("Could not load impact records", { status: 500 });
  const rows = (data ?? []).map((r) => [r.occurred_at.slice(0, 10), r.metric, Number(r.quantity), r.unit, r.verification, r.source_type, r.resource_category ?? "", r.method_note ?? ""]);
  return csvResponse(`impact-${orgId.slice(0, 8)}.csv`, toCsv(["Date", "Metric", "Quantity", "Unit", "Verification", "Source", "Category", "Method"], rows));
}
