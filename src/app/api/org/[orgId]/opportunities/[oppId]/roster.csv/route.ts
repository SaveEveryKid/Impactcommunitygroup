import { getSupabase, getCurrentUser } from "@/lib/supabase/server";
import { csvResponse, toCsv } from "@/lib/csv";

export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string; oppId: string }> }) {
  const { oppId } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const supabase = (await getSupabase())!;
  // opportunity_roster enforces coordinator role inside the database.
  const { data, error } = await supabase.rpc("opportunity_roster", { p_opp: oppId });
  if (error) return new Response(error.code === "42501" ? "Forbidden" : "Could not load roster", { status: error.code === "42501" ? 403 : 500 });
  type R = { display_name: string; email: string; status: string; is_adult: boolean; guardian_name: string | null; guardian_email: string | null; hours: number | null; hours_status: string | null };
  const rows = (data as R[]).map((r) => [r.display_name, r.email, r.status, r.is_adult ? "yes" : "no", r.guardian_name, r.guardian_email, r.hours, r.hours_status]);
  return csvResponse(`roster-${oppId.slice(0, 8)}.csv`, toCsv(["Name", "Email", "Status", "Adult", "Guardian", "Guardian email", "Hours", "Hours status"], rows));
}
