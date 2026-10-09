import { OpportunityForm } from "@/components/opportunity-form";
import { requireOrg } from "@/lib/auth";

export default async function NewOpportunity({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { org } = await requireOrg(orgId, "coordinator");
  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-semibold">New volunteer opportunity</h2>
      <div className="mt-6 rounded-[var(--radius-lg)] border border-line bg-surface p-6 sm:p-8">
        <OpportunityForm orgId={orgId} canPublish={org.status === "approved"} />
      </div>
    </div>
  );
}
