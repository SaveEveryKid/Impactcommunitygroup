import { EventForm } from "@/components/event-form";
import { requireOrg } from "@/lib/auth";

export default async function NewEvent({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { org, supabase } = await requireOrg(orgId, "coordinator");
  const { data: acct } = await supabase.from("org_payment_accounts").select("charges_enabled").eq("org_id", orgId).maybeSingle();
  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-semibold">New event</h2>
      <div className="mt-6 rounded-[var(--radius-lg)] border border-line bg-surface p-6 sm:p-8">
        <EventForm orgId={orgId} canPublish={org.status === "approved"} canCharge={Boolean(acct?.charges_enabled)} />
      </div>
    </div>
  );
}
