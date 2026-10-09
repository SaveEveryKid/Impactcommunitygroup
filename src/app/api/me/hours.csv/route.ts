import { getCurrentUser, getSupabase } from "@/lib/supabase/server";
import { csvResponse, toCsv } from "@/lib/csv";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const supabase = (await getSupabase())!;
  const { data, error } = await supabase
    .from("volunteer_hours")
    .select("hours, attended, status, verified_at, created_at, organizations(name), volunteer_applications(volunteer_opportunities(title))")
    .eq("user_id", user.id)
    .order("created_at");
  if (error) return new Response("Could not load hours", { status: 500 });
  type Row = { hours: number; attended: boolean; status: string; verified_at: string | null; created_at: string; organizations: { name: string }; volunteer_applications: { volunteer_opportunities: { title: string } } };
  const rows = (data as unknown as Row[]).map((r) => [
    r.organizations?.name,
    r.volunteer_applications?.volunteer_opportunities?.title,
    r.created_at.slice(0, 10),
    r.attended ? "yes" : "no",
    Number(r.hours),
    r.status,
    r.verified_at?.slice(0, 10) ?? "",
  ]);
  return csvResponse("volunteer-hours.csv", toCsv(["Organization", "Opportunity", "Recorded", "Attended", "Hours", "Verification", "Verified on"], rows));
}
