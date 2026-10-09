import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { decidePartnership } from "@/app/actions/organizations";
import { requireOrg, roleAtLeast } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { PartnershipForm } from "./partnership-form";

export default async function OrgPartnerships({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { orgId } = await params;
  const { error } = await searchParams;
  const { org, role, supabase } = await requireOrg(orgId);
  const isAdmin = roleAtLeast(role, "admin");
  const [{ data }, { data: orgs }] = await Promise.all([
    supabase
      .from("partnerships")
      .select("id, status, message, created_at, requester_org_id, target_org_id, requester:requester_org_id(name, slug), target:target_org_id(name, slug)")
      .or(`requester_org_id.eq.${orgId},target_org_id.eq.${orgId}`)
      .order("created_at", { ascending: false }),
    isAdmin && org.status === "approved"
      ? supabase.from("organizations").select("id, name").eq("status", "approved").neq("id", orgId).order("name").limit(500)
      : Promise.resolve({ data: [] }),
  ]);
  type P = { id: string; status: string; message: string | null; created_at: string; requester_org_id: string; target_org_id: string; requester: { name: string; slug: string }; target: { name: string; slug: string } };
  const rows = (data ?? []) as unknown as P[];
  const hidden = (id: string) => <><input type="hidden" name="org_id" value={orgId} /><input type="hidden" name="partnership_id" value={id} /></>;
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
      <section>
        <h2 className="text-2xl font-semibold">Partnerships</h2>
        <p className="mt-1 text-ink-soft">Accepted partnerships appear on both organizations&apos; public profiles.</p>
        {error ? <div className="mt-4"><FormMessage tone="error">{error}</FormMessage></div> : null}
        {rows.length ? (
          <ul className="mt-5 divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-surface">
            {rows.map((p) => {
              const incoming = p.target_org_id === orgId;
              const other = incoming ? p.requester : p.target;
              return (
                <li key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <Link href={`/organizations/${other.slug}`} className="font-semibold hover:underline">{other.name}</Link>
                    <p className="text-sm text-ink-muted">{incoming ? "Requested by them" : "Requested by you"}, {formatDate(p.created_at)}</p>
                    {p.message ? <p className="mt-1 text-ink-soft">{p.message}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={p.status === "accepted" ? "teal" : p.status === "pending" ? "warn" : "neutral"}>{p.status}</Badge>
                    {isAdmin && p.status === "pending" && incoming ? (
                      <>
                        <form action={decidePartnership}>{hidden(p.id)}<input type="hidden" name="status" value="accepted" /><Button type="submit" size="sm">Accept</Button></form>
                        <form action={decidePartnership}>{hidden(p.id)}<input type="hidden" name="status" value="declined" /><Button type="submit" size="sm" variant="secondary">Decline</Button></form>
                      </>
                    ) : null}
                    {isAdmin && (p.status === "accepted" || (p.status === "pending" && !incoming)) ? (
                      <form action={decidePartnership}>{hidden(p.id)}<input type="hidden" name="status" value="ended" /><Button type="submit" size="sm" variant="ghost" className="text-danger">{p.status === "pending" ? "Withdraw" : "End"}</Button></form>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-5 text-ink-muted">No partnerships yet.</p>
        )}
      </section>
      {isAdmin && org.status === "approved" ? (
        <aside className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
          <h3 className="text-lg font-semibold">Propose a partnership</h3>
          <PartnershipForm orgId={orgId} orgs={(orgs ?? []) as { id: string; name: string }[]} />
        </aside>
      ) : null}
    </div>
  );
}
