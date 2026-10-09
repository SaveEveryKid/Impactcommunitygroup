import Link from "next/link";
import { requirePlatformStaff } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";

export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ before?: string; action?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requirePlatformStaff();
  let q = supabase.from("audit_logs").select("id, action, target_type, target_id, org_id, metadata, created_at, profiles:actor_id(display_name)").order("id", { ascending: false }).limit(100);
  if (sp.before && /^\d+$/.test(sp.before)) q = q.lt("id", Number(sp.before));
  if (sp.action && /^[a-z_.]+$/.test(sp.action)) q = q.like("action", `${sp.action}%`);
  const { data } = await q;
  type A = { id: number; action: string; target_type: string; target_id: string | null; metadata: Record<string, unknown>; created_at: string; profiles: { display_name: string } | null };
  const rows = (data ?? []) as unknown as A[];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-2xl font-semibold">Audit log</h2>
        <form className="flex gap-2"><input name="action" defaultValue={sp.action} placeholder="Filter, e.g. verification" aria-label="Filter by action" className="h-10 rounded-[10px] border border-line-strong px-3" /><button className="rounded-full border border-line-strong px-4 font-semibold">Filter</button></form>
      </div>
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-surface">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-line text-ink-muted"><tr><th className="p-3">When</th><th className="p-3">Who</th><th className="p-3">Action</th><th className="p-3">Target</th><th className="p-3">Details</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="p-3 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                <td className="p-3">{r.profiles?.display_name ?? "System"}</td>
                <td className="p-3 font-semibold">{r.action}</td>
                <td className="p-3">{r.target_type} <span className="text-ink-muted">{r.target_id?.slice(0, 8)}</span></td>
                <td className="p-3 text-ink-muted"><code className="break-all">{Object.keys(r.metadata ?? {}).length ? JSON.stringify(r.metadata).slice(0, 200) : ""}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 100 ? <Link href={`/admin/audit?before=${rows[rows.length - 1].id}${sp.action ? `&action=${sp.action}` : ""}`} className="font-semibold text-teal-strong underline">Older entries</Link> : null}
    </div>
  );
}
