import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { setOrgStatus, toggleFeatured } from "@/app/actions/admin";
import { requirePlatformStaff } from "@/lib/auth";
import { VERIFICATION_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

export default async function AdminOrgs({ searchParams }: { searchParams: Promise<{ error?: string; status?: string; q?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requirePlatformStaff("admin");
  let q = supabase.from("organizations").select("id, slug, name, status, verification_level, is_featured, is_demo, city, region, created_at").order("created_at", { ascending: false }).limit(200);
  const status = ["pending", "approved", "suspended", "rejected"].includes(sp.status ?? "") ? sp.status! : undefined;
  if (status) q = q.eq("status", status);
  const term = (sp.q ?? "").replace(/[%_,()]/g, " ").trim();
  if (term) q = q.ilike("name", `%${term}%`);
  const { data } = await q;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-2xl font-semibold">Organizations</h2>
        <form className="flex flex-wrap gap-2">
          <input name="q" defaultValue={sp.q} placeholder="Search by name" aria-label="Search by name" className="h-10 rounded-[10px] border border-line-strong px-3" />
          <select name="status" defaultValue={status ?? ""} aria-label="Status" className="h-10 rounded-[10px] border border-line-strong px-2"><option value="">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="suspended">Suspended</option><option value="rejected">Rejected</option></select>
          <Button type="submit" size="sm" variant="secondary">Filter</Button>
        </form>
      </div>
      {sp.error ? <FormMessage tone="error">{sp.error}</FormMessage> : null}
      <ul className="divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-surface">
        {(data ?? []).map((o) => (
          <li key={o.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Link href={`/organizations/${o.slug}`} className="font-semibold hover:underline">{o.name}</Link>
              <p className="text-sm text-ink-muted">{o.city}, {o.region}, joined {formatDate(o.created_at)}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge tone={o.status === "approved" ? "teal" : o.status === "pending" ? "warn" : "danger"}>{o.status}</Badge>
                <Badge>{VERIFICATION_LABEL[o.verification_level as keyof typeof VERIFICATION_LABEL]}</Badge>
                {o.is_featured ? <Badge tone="marigold">Featured</Badge> : null}
                {o.is_demo ? <Badge tone="marigold">Demo</Badge> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {o.status === "approved" ? (
                <form action={toggleFeatured}><input type="hidden" name="org_id" value={o.id} /><input type="hidden" name="featured" value={String(o.is_featured)} /><Button type="submit" size="sm" variant="secondary">{o.is_featured ? "Unfeature" : "Feature on homepage"}</Button></form>
              ) : null}
              <details className="relative">
                <summary className="cursor-pointer rounded-full border border-line-strong px-4 py-1.5 text-sm font-semibold">Change status</summary>
                <form action={setOrgStatus} className="absolute right-0 z-10 mt-2 flex w-80 flex-col gap-2 rounded-[12px] border border-line bg-surface p-4 shadow-[var(--shadow-raised)]">
                  <input type="hidden" name="org_id" value={o.id} />
                  <select name="status" defaultValue={o.status === "approved" ? "suspended" : "approved"} className="h-10 rounded-[8px] border border-line-strong px-2" aria-label="New status">
                    <option value="approved">Approve (publish)</option><option value="suspended">Suspend</option><option value="rejected">Reject</option><option value="pending">Return to pending</option>
                  </select>
                  <input name="reason" required minLength={3} placeholder="Reason (logged)" aria-label="Reason" className="h-10 rounded-[8px] border border-line-strong px-2" />
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirm" className="h-4 w-4" /> I understand this changes public visibility</label>
                  <Button type="submit" size="sm">Apply</Button>
                </form>
              </details>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-sm text-ink-muted">Approving here publishes an organization without verifying it. Use Verification to grant a verified badge.</p>
    </div>
  );
}
