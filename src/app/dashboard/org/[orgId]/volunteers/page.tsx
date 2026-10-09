import Link from "next/link";
import { HandHeart, Plus } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/misc";
import { requireOrg, roleAtLeast } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";

export default async function OrgVolunteers({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { role, supabase } = await requireOrg(orgId);
  const { data } = await supabase
    .from("volunteer_opportunities")
    .select("id, title, status, starts_at, timezone, capacity, volunteer_applications(status)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  type O = { id: string; title: string; status: string; starts_at: string | null; timezone: string; capacity: number | null; volunteer_applications: { status: string }[] };
  const rows = (data ?? []) as unknown as O[];
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Volunteer opportunities</h2>
        {roleAtLeast(role, "coordinator") ? (
          <LinkButton href={`/dashboard/org/${orgId}/volunteers/new`}><Plus className="h-4 w-4" aria-hidden="true" /> New opportunity</LinkButton>
        ) : null}
      </div>
      {rows.length ? (
        <ul className="divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-surface">
          {rows.map((o) => {
            const c = (s: string) => o.volunteer_applications.filter((a) => a.status === s).length;
            return (
              <li key={o.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Link href={`/dashboard/org/${orgId}/volunteers/${o.id}`} className="font-semibold hover:underline">{o.title}</Link>
                  <p className="text-sm text-ink-muted">{o.starts_at ? formatDateTime(o.starts_at, o.timezone) : "Ongoing"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {c("pending") ? <Badge tone="warn">{c("pending")} to review</Badge> : null}
                  <Badge tone="teal">{c("approved")} confirmed{o.capacity ? ` of ${o.capacity}` : ""}</Badge>
                  {c("waitlisted") ? <Badge>{c("waitlisted")} waitlisted</Badge> : null}
                  <Badge>{o.status}</Badge>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={HandHeart} title="No opportunities yet" action={roleAtLeast(role, "coordinator") ? <LinkButton href={`/dashboard/org/${orgId}/volunteers/new`}>Create one</LinkButton> : undefined}>
          Post a role with dates, capacity and the skills that help. Volunteers can sign up right away.
        </EmptyState>
      )}
    </div>
  );
}
