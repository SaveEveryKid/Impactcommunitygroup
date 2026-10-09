import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { processDeletion, setPlatformRole } from "@/app/actions/admin";
import { requirePlatformStaff } from "@/lib/auth";
import { formatDate } from "@/lib/utils";

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ error?: string; q?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requirePlatformStaff("admin");
  const term = (sp.q ?? "").replace(/[%_,()]/g, " ").trim();
  const [{ data: staff }, { data: deletions }, { data: found }] = await Promise.all([
    supabase.from("platform_admins").select("user_id, role, created_at, profiles:user_id(display_name)").order("created_at"),
    supabase.from("account_deletion_requests").select("id, user_id, reason, created_at, profiles:user_id(display_name)").eq("status", "pending").order("created_at"),
    term ? supabase.from("profiles").select("id, display_name, general_location, is_adult, created_at, is_demo").ilike("display_name", `%${term}%`).limit(25) : Promise.resolve({ data: [] }),
  ]);
  const isSuper = user.platformRole === "super_admin";
  type S = { user_id: string; role: string; created_at: string; profiles: { display_name: string } | null };
  type D = { id: string; user_id: string; reason: string | null; created_at: string; profiles: { display_name: string } | null };
  const roleForm = (uid: string, current: string) => (
    <form action={setPlatformRole} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="user_id" value={uid} />
      <select name="role" defaultValue={current} aria-label="Platform role" className="h-9 rounded-[8px] border border-line-strong px-2">
        <option value="none">No platform access</option><option value="moderator">Moderator</option><option value="admin">Admin</option><option value="super_admin">Super admin</option>
      </select>
      <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="confirm" className="h-4 w-4" /> Confirm</label>
      <Button type="submit" size="sm" variant="secondary">Save</Button>
    </form>
  );
  return (
    <div className="space-y-10">
      {sp.error ? <FormMessage tone="error">{sp.error}</FormMessage> : null}
      <section>
        <h2 className="text-2xl font-semibold">Platform staff</h2>
        <p className="mt-1 text-sm text-ink-muted">Moderators handle reports and the contact inbox. Admins also approve organizations and campaigns. Only super admins grant access or enable live payments.</p>
        <ul className="mt-4 divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-surface">
          {((staff ?? []) as unknown as S[]).map((s) => (
            <li key={s.user_id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-semibold">{s.profiles?.display_name ?? s.user_id}</p><p className="text-sm text-ink-muted">Since {formatDate(s.created_at)}</p></div>
              {isSuper && s.user_id !== user.id ? roleForm(s.user_id, s.role) : <Badge className="capitalize">{s.role.replace("_", " ")}</Badge>}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-2xl font-semibold">Find a member</h2>
        <form className="mt-3 flex gap-2"><input name="q" defaultValue={sp.q} placeholder="Name" aria-label="Search members by name" className="h-10 flex-1 rounded-[10px] border border-line-strong px-3" /><Button type="submit" size="sm" variant="secondary">Search</Button></form>
        {term ? (
          <ul className="mt-4 divide-y divide-line rounded-[var(--radius-md)] border border-line bg-surface">
            {(found ?? []).map((p) => (
              <li key={p.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-semibold">{p.display_name} {!p.is_adult ? <Badge tone="warn">Under 18</Badge> : null} {p.is_demo ? <Badge tone="marigold">Demo</Badge> : null}</p><p className="text-sm text-ink-muted">{p.general_location ?? "No location"}, joined {formatDate(p.created_at)}</p></div>
                {isSuper && p.id !== user.id ? roleForm(p.id, "none") : null}
              </li>
            ))}
            {!found?.length ? <li className="p-4 text-ink-muted">No members found.</li> : null}
          </ul>
        ) : null}
      </section>
      <section>
        <h2 className="text-2xl font-semibold">Account deletion requests</h2>
        <p className="mt-1 text-sm text-ink-muted">Complete within 30 days of the request. Deleting removes the login and profile; donation records are kept without the profile attached.</p>
        {!deletions?.length ? <p className="mt-3 text-ink-muted">None pending.</p> : null}
        <ul className="mt-4 space-y-3">
          {((deletions ?? []) as unknown as D[]).map((d) => (
            <li key={d.id} className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
              <p className="font-semibold">{d.profiles?.display_name ?? d.user_id}</p>
              <p className="text-sm text-ink-muted">Requested {formatDate(d.created_at)}{d.reason ? `: ${d.reason}` : ""}</p>
              <form action={processDeletion} className="mt-3 flex flex-wrap items-center gap-2">
                <input type="hidden" name="request_id" value={d.id} />
                <input name="confirm" placeholder="Type DELETE" aria-label="Type DELETE to confirm" className="h-9 w-36 rounded-[8px] border border-line-strong px-2" />
                <Button type="submit" size="sm" variant="danger">Delete account permanently</Button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
