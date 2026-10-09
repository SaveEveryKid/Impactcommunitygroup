import Link from "next/link";
import { Package, Plus } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/misc";
import { requireOrg, roleAtLeast } from "@/lib/auth";
import { RESOURCE_CATEGORY_LABEL, type ResourceCategory } from "@/lib/constants";
import { formatDate, formatNumber } from "@/lib/utils";

const STATUS_TONE: Record<string, "teal" | "warn" | "neutral" | "danger"> = { published: "teal", draft: "neutral", fully_reserved: "warn", fulfilled: "teal", expired: "neutral", cancelled: "danger" };

export default async function OrgResources({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { role, supabase } = await requireOrg(orgId);
  const { data } = await supabase
    .from("resources")
    .select("id, kind, title, category, quantity_total, quantity_available, unit, status, created_at, resource_requests(status)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  type R = { id: string; kind: string; title: string; category: string; quantity_total: number; quantity_available: number; unit: string; status: string; created_at: string; resource_requests: { status: string }[] };
  const rows = (data ?? []) as unknown as R[];
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Your listings</h2>
        {roleAtLeast(role, "coordinator") ? (
          <LinkButton href={`/dashboard/org/${orgId}/resources/new`}>
            <Plus className="h-4 w-4" aria-hidden="true" /> New listing
          </LinkButton>
        ) : null}
      </div>
      {rows.length ? (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-surface">
          <table className="w-full min-w-[680px] text-left">
            <thead className="border-b border-line text-sm text-ink-muted">
              <tr>
                <th scope="col" className="p-4 font-semibold">Listing</th>
                <th scope="col" className="p-4 font-semibold">Available</th>
                <th scope="col" className="p-4 font-semibold">Pending requests</th>
                <th scope="col" className="p-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const pending = r.resource_requests.filter((q) => q.status === "pending").length;
                return (
                  <tr key={r.id}>
                    <td className="p-4">
                      <Link href={`/dashboard/org/${orgId}/resources/${r.id}`} className="font-semibold hover:underline">{r.title}</Link>
                      <p className="text-sm text-ink-muted">{r.kind === "need" ? "Need" : "Offer"}, {RESOURCE_CATEGORY_LABEL[r.category as ResourceCategory]}, {formatDate(r.created_at)}</p>
                    </td>
                    <td className="p-4">{formatNumber(r.quantity_available, 2)} / {formatNumber(r.quantity_total, 2)} {r.unit}</td>
                    <td className="p-4">{pending ? <Badge tone="warn">{pending} to review</Badge> : <span className="text-ink-muted">None</span>}</td>
                    <td className="p-4"><Badge tone={STATUS_TONE[r.status]}>{r.status.replace("_", " ")}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={Package} title="No listings yet" action={roleAtLeast(role, "coordinator") ? <LinkButton href={`/dashboard/org/${orgId}/resources/new`}>Create your first listing</LinkButton> : undefined}>
          List surplus you can give, or post something your organization needs.
        </EmptyState>
      )}
    </div>
  );
}
