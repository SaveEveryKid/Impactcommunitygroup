import Link from "next/link";
import { requirePlatformStaff } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";

export default async function AdminHome() {
  const { supabase } = await requirePlatformStaff();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const count = async (table: string, f?: (q: any) => any) => {  // eslint-disable-line @typescript-eslint/no-explicit-any
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (f) q = f(q);
    return (await q).count ?? 0;
  };
  const [users, newUsers, orgs, pendingOrgs, verif, reports, contact, campaigns, transfers, failedWebhooks, deletions] = await Promise.all([
    count("profiles", (q) => q.eq("is_demo", false)),
    count("profiles", (q) => q.eq("is_demo", false).gte("created_at", since)),
    count("organizations", (q) => q.eq("status", "approved").eq("is_demo", false)),
    count("organizations", (q) => q.eq("status", "pending")),
    count("verification_requests", (q) => q.in("status", ["submitted", "in_review"])),
    count("content_reports", (q) => q.in("status", ["open", "reviewing"])),
    count("contact_messages", (q) => q.eq("status", "new")),
    count("fundraising_campaigns", (q) => q.eq("status", "pending_review")),
    count("resource_transfers", (q) => q.not("status", "in", "(completed,cancelled)")),
    count("stripe_events", (q) => q.not("error", "is", null).is("processed_at", null)),
    count("account_deletion_requests", (q) => q.eq("status", "pending")),
  ]);
  const { data: recent } = await supabase.from("audit_logs").select("id, action, target_type, created_at, profiles:actor_id(display_name)").order("created_at", { ascending: false }).limit(10);
  const queue = [
    [verif, "verification requests", "/admin/verifications"],
    [pendingOrgs, "organizations awaiting review", "/admin/organizations"],
    [reports, "open content reports", "/admin/reports"],
    [contact, "new contact messages", "/admin/inbox"],
    [campaigns, "campaigns awaiting approval", "/admin/payments"],
    [deletions, "account deletion requests", "/admin/users"],
    [failedWebhooks, "payment events that failed to process", "/admin/payments"],
  ].filter(([n]) => Number(n) > 0) as [number, string, string][];
  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-2xl font-semibold">Your queue</h2>
        {queue.length ? (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {queue.map(([n, label, href]) => (
              <li key={label}><Link href={href} className="block rounded-[var(--radius-md)] border border-line bg-surface p-4 hover:border-ink/40"><span className="font-display text-3xl font-bold">{n}</span> <span className="text-ink-soft">{label}</span></Link></li>
            ))}
          </ul>
        ) : <p className="mt-3 text-ink-muted">Nothing waiting. Nice.</p>}
      </section>
      <section>
        <h2 className="text-2xl font-semibold">Platform activity</h2>
        <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-line bg-line sm:grid-cols-4">
          {[["Members", users], ["New members (30 days)", newUsers], ["Approved organizations", orgs], ["Transfers in progress", transfers]].map(([l, v]) => (
            <div key={String(l)} className="bg-surface p-5"><dt className="text-sm text-ink-muted">{l}</dt><dd className="font-display text-3xl font-bold">{Number(v).toLocaleString()}</dd></div>
          ))}
        </dl>
        <p className="mt-2 text-sm text-ink-muted">Excludes demonstration data. Full impact metrics are under Impact.</p>
      </section>
      <section>
        <h2 className="text-2xl font-semibold">Recent admin and system actions</h2>
        <ul className="mt-4 divide-y divide-line rounded-[var(--radius-md)] border border-line bg-surface">
          {((recent ?? []) as unknown as { id: number; action: string; target_type: string; created_at: string; profiles: { display_name: string } | null }[]).map((r) => (
            <li key={r.id} className="flex justify-between gap-3 p-3 text-sm"><span><strong>{r.profiles?.display_name ?? "System"}</strong> {r.action}</span><span className="text-ink-muted">{formatDateTime(r.created_at)}</span></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
