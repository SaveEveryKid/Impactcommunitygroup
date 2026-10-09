import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { ResourceForm } from "@/components/resource-form";
import { decideRequest, setResourceStatus } from "@/app/actions/resources";
import { requireOrg, roleAtLeast } from "@/lib/auth";
import { formatDateTime, formatNumber, utcToZonedLocal } from "@/lib/utils";

export default async function ManageResource({ params, searchParams }: { params: Promise<{ orgId: string; resourceId: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { orgId, resourceId } = await params;
  const sp = await searchParams;
  const { org, role, supabase } = await requireOrg(orgId);
  const [{ data: r }, { data: priv }, { data: requests }, { data: transfers }] = await Promise.all([
    supabase.from("resources").select("*").eq("id", resourceId).eq("org_id", orgId).maybeSingle(),
    supabase.from("resource_private_details").select("*").eq("resource_id", resourceId).maybeSingle(),
    supabase
      .from("resource_requests")
      .select("id, quantity_requested, quantity_approved, message, intended_use, status, created_at, decision_note, organizations:requesting_org_id(name, slug, verification_level)")
      .eq("resource_id", resourceId)
      .order("created_at", { ascending: false }),
    supabase.from("resource_transfers").select("id, quantity, unit, status, to_org:to_org_id(name), from_org:from_org_id(name)").eq("resource_id", resourceId).order("created_at", { ascending: false }),
  ]);
  if (!r) notFound();
  const isCoord = roleAtLeast(role, "coordinator");
  const available = Number(r.quantity_available);
  type Q = { id: string; quantity_requested: number; quantity_approved: number; message: string | null; intended_use: string | null; status: string; created_at: string; decision_note: string | null; organizations: { name: string; slug: string; verification_level: string } };
  type T = { id: string; quantity: number; unit: string; status: string; to_org: { name: string }; from_org: { name: string } };

  return (
    <div className="space-y-10">
      {sp.saved ? <FormMessage tone="success">Listing saved.</FormMessage> : null}
      {sp.error ? <FormMessage tone="error">{sp.error}</FormMessage> : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">{r.title}</h2>
          <p className="mt-1 text-ink-soft">
            {formatNumber(available, 2)} of {formatNumber(r.quantity_total, 2)} {r.unit} available. <Badge>{r.status.replace("_", " ")}</Badge>
          </p>
          <Link href={`/resources/${r.id}`} className="mt-2 inline-block font-semibold text-teal-strong hover:underline">View public listing</Link>
        </div>
        {isCoord ? (
          <div className="flex flex-wrap gap-2">
            {r.status === "published" && available === Number(r.quantity_total) ? (
              <form action={setResourceStatus}>
                <input type="hidden" name="org_id" value={orgId} />
                <input type="hidden" name="resource_id" value={r.id} />
                <input type="hidden" name="status" value="draft" />
                <Button type="submit" variant="secondary" size="sm">Unpublish</Button>
              </form>
            ) : null}
            {["draft", "published", "fully_reserved"].includes(r.status) ? (
              <form action={setResourceStatus}>
                <input type="hidden" name="org_id" value={orgId} />
                <input type="hidden" name="resource_id" value={r.id} />
                <input type="hidden" name="status" value="cancelled" />
                <Button type="submit" variant="ghost" size="sm" className="text-danger">Withdraw listing</Button>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>

      <section aria-labelledby="requests">
        <h3 id="requests" className="text-xl font-semibold">{r.kind === "need" ? "Offers to help" : "Requests"}</h3>
        {(requests ?? []).length ? (
          <ul className="mt-4 space-y-3">
            {((requests ?? []) as unknown as Q[]).map((q) => (
              <li key={q.id} className="rounded-[var(--radius-md)] border border-line bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link href={`/organizations/${q.organizations.slug}`} className="font-semibold hover:underline">{q.organizations.name}</Link>
                    <p className="text-sm text-ink-muted">
                      {r.kind === "need" ? "Offers" : "Requests"} {formatNumber(q.quantity_requested, 2)} {r.unit}, {formatDateTime(q.created_at)}
                    </p>
                  </div>
                  <Badge tone={q.status === "pending" ? "warn" : q.status === "declined" || q.status === "cancelled" ? "neutral" : "teal"}>
                    {q.status === "partially_approved" ? `Approved ${formatNumber(q.quantity_approved, 2)}` : q.status}
                  </Badge>
                </div>
                {q.intended_use ? <p className="mt-3"><span className="font-semibold">{r.kind === "need" ? "Offering: " : "Use: "}</span>{q.intended_use}</p> : null}
                {q.message ? <p className="mt-2 whitespace-pre-line text-ink-soft">{q.message}</p> : null}
                {q.status === "pending" && isCoord ? (
                  <form action={decideRequest} className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
                    <input type="hidden" name="org_id" value={orgId} />
                    <input type="hidden" name="resource_id" value={r.id} />
                    <input type="hidden" name="request_id" value={q.id} />
                    <label className="flex flex-col gap-1 text-sm font-semibold">
                      Quantity to approve ({r.unit})
                      <input
                        type="number"
                        name="quantity"
                        min="0.01"
                        step="any"
                        max={Math.min(Number(q.quantity_requested), available)}
                        defaultValue={Math.min(Number(q.quantity_requested), available)}
                        className="h-11 w-36 rounded-[10px] border border-line-strong px-3 font-normal"
                      />
                    </label>
                    <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-semibold">
                      Note (optional)
                      <input name="note" maxLength={1000} className="h-11 rounded-[10px] border border-line-strong px-3 font-normal" />
                    </label>
                    <Button type="submit" name="decision" value="approve" disabled={available <= 0}>Approve</Button>
                    <Button type="submit" name="decision" value="decline" variant="secondary">Decline</Button>
                  </form>
                ) : q.decision_note ? (
                  <p className="mt-2 text-sm text-ink-muted">Note: {q.decision_note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-ink-muted">No requests yet.</p>
        )}
      </section>

      {(transfers ?? []).length ? (
        <section aria-labelledby="transfers">
          <h3 id="transfers" className="text-xl font-semibold">Transfers</h3>
          <ul className="mt-4 divide-y divide-line rounded-[var(--radius-md)] border border-line bg-surface">
            {((transfers ?? []) as unknown as T[]).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 p-4">
                <Link href={`/transfers/${t.id}`} className="font-semibold hover:underline">
                  {formatNumber(t.quantity, 2)} {t.unit} from {t.from_org.name} to {t.to_org.name}
                </Link>
                <Badge tone={t.status === "completed" ? "teal" : t.status === "problem" ? "danger" : "neutral"}>{t.status}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {isCoord && !["fulfilled", "cancelled"].includes(r.status) ? (
        <section aria-labelledby="edit">
          <h3 id="edit" className="text-xl font-semibold">Edit listing</h3>
          <div className="mt-4 max-w-3xl rounded-[var(--radius-lg)] border border-line bg-surface p-6 sm:p-8">
            <ResourceForm
              orgId={orgId}
              canPublish={org.status === "approved"}
              reserved={Number(r.quantity_total) - available}
              resource={{ ...r, expires_local: utcToZonedLocal(r.expires_at), pickup_address: priv?.pickup_address, contact_name: priv?.contact_name, contact_phone: priv?.contact_phone }}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
