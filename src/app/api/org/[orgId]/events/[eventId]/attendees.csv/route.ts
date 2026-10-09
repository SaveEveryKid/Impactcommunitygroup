import { getSupabase, getCurrentUser } from "@/lib/supabase/server";
import { csvResponse, toCsv } from "@/lib/csv";

export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string; eventId: string }> }) {
  const { eventId } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const supabase = (await getSupabase())!;
  const { data, error } = await supabase.rpc("event_roster", { p_event: eventId });
  if (error) return new Response(error.code === "42501" ? "Forbidden" : "Could not load attendees", { status: error.code === "42501" ? 403 : 500 });
  type R = { display_name: string; email: string; status: string; ticket_code: string; checked_in_at: string | null; amount_cents: number };
  const rows = (data as R[]).map((r) => [r.display_name, r.email, r.status, r.ticket_code, r.checked_in_at ?? "", (r.amount_cents / 100).toFixed(2)]);
  return csvResponse(`attendees-${eventId.slice(0, 8)}.csv`, toCsv(["Name", "Email", "Status", "Ticket", "Checked in", "Paid"], rows));
}
