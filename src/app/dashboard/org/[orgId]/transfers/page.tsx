import Link from "next/link";
import { Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Badge, EmptyState } from "@/components/ui/misc";
import { cancelMyRequest } from "@/app/actions/resources";
import { requireOrg, roleAtLeast } from "@/lib/auth";
import { formatDateTime, formatNumber } from "@/lib/utils";

export default async function OrgTransfers({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { orgId } = await params;
  const { error } = await searchParams;
  const { role, supabase } = await requireOrg(orgId);
  const [{ data: transfers }, { data: myRequests }] = await Promise.all([
    supabase
      .from("resource_transfers")
      .select("id, quantity, unit, status, pickup_window_start, from_org_id, to_org_id, updated_at, resources(title), from_org:from_org_id(name), to_org:to_org_id(name)")
      .or(`from_org_id.eq.${orgId},to_org_id.eq.${orgId}`)
      .order("updated_at", { ascending: false })
      .limit(100),
    supabase
      .from("resource_requests")
      .select("id, quantity_requested, status, created_at, resources(id, title, unit, organizations(name))")
      .eq("requesting_org_id", orgId)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);
  type T = { id: string; quantity: number; unit: string; status: string; pickup_window_start: string | null; from_org_id: string; resources: { title: string }; from_org: { name: string }; to_org: { name: string } };
  type Q = { id: string; quantity_requested: number; created_at: string; resources: { id: string; title: string; unit: string; organizations: { name: string } } };
  const rows = (transfers ?? []) as unknown as T[];
  const active = rows.filter((t) => !["completed", "cancelled"].includes(t.status));
  const done = rows.filter((t) => ["completed", "cancelled"].includes(t.status));

  const List = ({ items }: { items: T[] }) => (
    <ul className="mt-4 divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-surface">
      {items.map((t) => {
        const outgoing = t.from_org_id === orgId;
        return (
          <li key={t.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Link href={`/transfers/${t.id}`} className="font-semibold hover:underline">{t.resources.title}</Link>
              <p className="text-sm text-ink-muted">
                {outgoing ? `Giving to ${t.to_org.name}` : `Receiving from ${t.from_org.name}`}, {formatNumber(t.quantity, 2)} {t.unit}
                {t.pickup_window_start ? `, pickup ${formatDateTime(t.pickup_window_start)}` : ""}
              </p>
            </div>
            <Badge tone={t.status === "completed" ? "teal" : t.status === "problem" ? "danger" : t.status === "cancelled" ? "neutral" : "warn"}>{t.status}</Badge>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="space-y-10">
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      <section>
        <h2 className="text-2xl font-semibold">In progress</h2>
        {active.length ? <List items={active} /> : (
          <div className="mt-4"><EmptyState icon={Truck} title="No active transfers">Approved requests become transfers you can schedule and track here.</EmptyState></div>
        )}
      </section>
      {(myRequests ?? []).length ? (
        <section>
          <h2 className="text-xl font-semibold">Your pending requests</h2>
          <ul className="mt-4 divide-y divide-line rounded-[var(--radius-md)] border border-line bg-surface">
            {((myRequests ?? []) as unknown as Q[]).map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <Link href={`/resources/${q.resources.id}`} className="font-semibold hover:underline">{q.resources.title}</Link>
                  <p className="text-sm text-ink-muted">{formatNumber(q.quantity_requested, 2)} {q.resources.unit} from {q.resources.organizations.name}, awaiting their decision</p>
                </div>
                {roleAtLeast(role, "coordinator") ? (
                  <form action={cancelMyRequest}>
                    <input type="hidden" name="org_id" value={orgId} />
                    <input type="hidden" name="request_id" value={q.id} />
                    <Button type="submit" size="sm" variant="ghost" className="text-danger">Withdraw</Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {done.length ? (
        <section>
          <h2 className="text-xl font-semibold">History</h2>
          <List items={done} />
        </section>
      ) : null}
    </div>
  );
}
