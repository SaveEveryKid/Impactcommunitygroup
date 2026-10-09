import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { changeMemberRole, removeMember, revokeInvitation } from "@/app/actions/organizations";
import { requireOrg, roleAtLeast } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { InviteForm } from "./invite-form";

const ROLE_HELP: Record<string, string> = {
  owner: "Everything, including managing admins and other owners",
  admin: "Edit profile, manage team, donations and verification",
  coordinator: "Create listings, opportunities and events; manage volunteers and transfers",
  member: "View the organization dashboard and conversations",
};

export default async function TeamPage({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { orgId } = await params;
  const { error } = await searchParams;
  const { role, supabase, user } = await requireOrg(orgId);
  const isAdmin = roleAtLeast(role, "admin");
  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase.from("organization_members").select("user_id, role, title, created_at, profiles(display_name)").eq("org_id", orgId).order("created_at"),
    isAdmin
      ? supabase.from("organization_invitations").select("id, email, role, expires_at, created_at").eq("org_id", orgId).is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString())
      : Promise.resolve({ data: [] }),
  ]);
  type M = { user_id: string; role: string; title: string | null; created_at: string; profiles: { display_name: string } | null };
  const assignable = role === "owner" ? ["member", "coordinator", "admin", "owner"] : ["member", "coordinator"];

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
      <div className="space-y-8">
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
        <section>
          <h2 className="text-2xl font-semibold">Team members</h2>
          <ul className="mt-4 divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-surface">
            {((members ?? []) as unknown as M[]).map((m) => {
              const canManage = isAdmin && m.user_id !== user.id && (role === "owner" || !["admin", "owner"].includes(m.role));
              return (
                <li key={m.user_id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">
                      {m.profiles?.display_name ?? "Member"} {m.user_id === user.id ? <span className="font-normal text-ink-muted">(you)</span> : null}
                    </p>
                    <p className="text-sm text-ink-muted">Joined {formatDate(m.created_at)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canManage ? (
                      <form action={changeMemberRole} className="flex items-center gap-2">
                        <input type="hidden" name="org_id" value={orgId} />
                        <input type="hidden" name="user_id" value={m.user_id} />
                        <label className="sr-only" htmlFor={`role-${m.user_id}`}>
                          Role for {m.profiles?.display_name}
                        </label>
                        <select id={`role-${m.user_id}`} name="role" defaultValue={m.role} className="h-10 rounded-[10px] border border-line-strong bg-surface px-2">
                          {assignable.map((r) => (
                            <option key={r} value={r} className="capitalize">
                              {r}
                            </option>
                          ))}
                        </select>
                        <Button type="submit" size="sm" variant="secondary">
                          Update
                        </Button>
                      </form>
                    ) : (
                      <Badge className="capitalize">{m.role}</Badge>
                    )}
                    {canManage || m.user_id === user.id ? (
                      <form action={removeMember}>
                        <input type="hidden" name="org_id" value={orgId} />
                        <input type="hidden" name="user_id" value={m.user_id} />
                        <Button type="submit" size="sm" variant="ghost" className="text-danger">
                          {m.user_id === user.id ? "Leave" : "Remove"}
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
        {isAdmin && invites?.length ? (
          <section>
            <h2 className="text-xl font-semibold">Pending invitations</h2>
            <ul className="mt-3 divide-y divide-line rounded-[var(--radius-md)] border border-line bg-surface">
              {invites.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-semibold">{i.email}</p>
                    <p className="text-sm capitalize text-ink-muted">
                      {i.role}, expires {formatDate(i.expires_at)}
                    </p>
                  </div>
                  <form action={revokeInvitation}>
                    <input type="hidden" name="org_id" value={orgId} />
                    <input type="hidden" name="invitation_id" value={i.id} />
                    <Button type="submit" size="sm" variant="ghost" className="text-danger">
                      Revoke
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
      <aside className="space-y-8">
        {isAdmin ? (
          <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
            <h2 className="text-lg font-semibold">Invite someone</h2>
            <InviteForm orgId={orgId} canInviteAdmin={role === "owner"} />
          </section>
        ) : null}
        <section>
          <h2 className="font-display text-lg font-semibold">Roles</h2>
          <dl className="mt-3 space-y-3 text-[0.95rem]">
            {Object.entries(ROLE_HELP).map(([r, d]) => (
              <div key={r}>
                <dt className="font-semibold capitalize">{r}</dt>
                <dd className="text-ink-soft">{d}</dd>
              </div>
            ))}
          </dl>
        </section>
      </aside>
    </div>
  );
}
