import { getCurrentUser, getSupabase } from "@/lib/supabase/server";

/** Personal data export (JSON). Includes only rows the user can already see via RLS. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const supabase = (await getSupabase())!;
  const q = (table: string, col = "user_id") => supabase.from(table).select("*").eq(col, user.id);
  const [profile, volunteer, apps, hours, regs, follows, memberships, donations, notifications, prefs] = await Promise.all([
    q("profiles", "id"),
    q("volunteer_profiles"),
    q("volunteer_applications"),
    q("volunteer_hours"),
    q("event_registrations"),
    q("follows"),
    q("organization_members"),
    q("donations", "donor_user_id"),
    q("notifications"),
    q("notification_preferences"),
  ]);
  const { data: sent } = await supabase.from("messages").select("conversation_id, body, created_at").eq("sender_id", user.id);
  const body = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email },
    profile: profile.data?.[0] ?? null,
    volunteer_profile: volunteer.data?.[0] ?? null,
    volunteer_applications: apps.data,
    volunteer_hours: hours.data,
    event_registrations: regs.data,
    follows: follows.data,
    organization_memberships: memberships.data,
    donations: donations.data,
    messages_sent: sent,
    notifications: notifications.data,
    notification_preferences: prefs.data,
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="my-data.json"', "Cache-Control": "no-store" },
  });
}
