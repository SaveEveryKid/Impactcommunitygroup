import { getCurrentUser, getSupabase } from "@/lib/supabase/server";
import { csvResponse, toCsv } from "@/lib/csv";

export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!(await getCurrentUser())) return new Response("Sign in required", { status: 401 });
  const supabase = (await getSupabase())!;
  const all: unknown[] = [];
  for (let offset = 0; offset < 50_000; offset += 500) {
    const { data, error } = await supabase.rpc("org_donations", { p_org: orgId, p_limit: 500, p_offset: offset });
    if (error) return new Response(error.code === "42501" ? "Forbidden" : "Could not load donations", { status: error.code === "42501" ? 403 : 500 });
    all.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  type D = { created_at: string; donor_display: string; donor_email: string | null; amount_cents: number; refunded_cents: number; status: string; is_recurring: boolean; receipt_number: string | null };
  const rows = (all as D[]).map((d) => [d.created_at.slice(0, 10), d.donor_display, d.donor_email, (d.amount_cents / 100).toFixed(2), (d.refunded_cents / 100).toFixed(2), d.status, d.is_recurring ? "yes" : "no", d.receipt_number]);
  return csvResponse("donations.csv", toCsv(["Date", "Donor", "Email", "Amount", "Refunded", "Status", "Recurring", "Receipt"], rows));
}
