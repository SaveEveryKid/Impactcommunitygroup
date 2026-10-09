import { ResourceForm } from "@/components/resource-form";
import { requireOrg } from "@/lib/auth";

export default async function NewResource({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { org } = await requireOrg(orgId, "coordinator");
  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-semibold">New listing</h2>
      <div className="mt-6 rounded-[var(--radius-lg)] border border-line bg-surface p-6 sm:p-8">
        <ResourceForm orgId={orgId} canPublish={org.status === "approved"} />
      </div>
    </div>
  );
}
