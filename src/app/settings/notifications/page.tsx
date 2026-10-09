import { requireUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase/server";
import { NotificationForm } from "../forms";

const TYPES = [
  { type: "message", label: "New messages" },
  { type: "resource_request", label: "Requests for my organization's listings" },
  { type: "resource_request_decided", label: "Decisions on my organization's requests" },
  { type: "transfer_update", label: "Resource transfer updates" },
  { type: "volunteer_application", label: "New volunteer sign-ups (coordinators)" },
  { type: "volunteer_decision", label: "Decisions on my volunteer applications" },
  { type: "volunteer_reminder", label: "Volunteer shift reminders" },
  { type: "event_registration", label: "Event registration confirmations" },
  { type: "event_reminder", label: "Event reminders" },
  { type: "event_update", label: "Changes to events I'm attending" },
  { type: "partnership_request", label: "Partnership requests" },
  { type: "verification_update", label: "Organization verification updates" },
  { type: "donation_receipt", label: "Donation receipts" },
  { type: "announcement", label: "Platform announcements" },
];

export default async function NotificationSettingsPage() {
  const user = await requireUser("/settings/notifications");
  const supabase = (await getSupabase())!;
  const [{ data }, { data: unsub }] = await Promise.all([
    supabase.from("notification_preferences").select("type, email").eq("user_id", user.id),
    supabase.from("email_unsubscribes").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);
  const prefs = Object.fromEntries((data ?? []).map((p) => [p.type, p.email]));
  return (
    <div>
      <h1 className="text-3xl font-bold">Notifications</h1>
      <div className="mt-6 rounded-[var(--radius-lg)] border border-line bg-surface p-6">
        <NotificationForm types={TYPES} prefs={prefs} marketingOff={Boolean(unsub)} />
      </div>
    </div>
  );
}
