import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { deletePost } from "@/app/actions/org-misc";
import { requireOrg, roleAtLeast } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";
import { PostForm } from "./post-form";

export default async function OrgPosts({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { orgId } = await params;
  const { error } = await searchParams;
  const { org, role, supabase } = await requireOrg(orgId, "coordinator");
  const { data: posts } = await supabase.from("posts").select("id, kind, title, body, status, created_at, moderation_note").eq("org_id", orgId).order("created_at", { ascending: false }).limit(50);
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
      <section>
        <h2 className="text-2xl font-semibold">Post an update</h2>
        <p className="mt-1 text-ink-soft">Updates appear on your profile and in the feeds of people who follow you.</p>
        <div className="mt-5 rounded-[var(--radius-lg)] border border-line bg-surface p-6">
          {org.status === "approved" ? <PostForm orgId={orgId} /> : <p className="text-ink-muted">You can post once your organization is approved.</p>}
        </div>
      </section>
      <section>
        <h2 className="text-2xl font-semibold">Recent posts</h2>
        {error ? <div className="mt-3"><FormMessage tone="error">{error}</FormMessage></div> : null}
        <ul className="mt-5 space-y-3">
          {(posts ?? []).map((p) => (
            <li key={p.id} className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-ink-muted">{formatDateTime(p.created_at)}</span>
                <div className="flex items-center gap-2">
                  {p.status !== "published" ? <Badge tone="danger">{p.status} by moderators</Badge> : null}
                  {roleAtLeast(role, "admin") ? (
                    <form action={deletePost}><input type="hidden" name="org_id" value={orgId} /><input type="hidden" name="post_id" value={p.id} /><Button type="submit" size="sm" variant="ghost" className="text-danger">Delete</Button></form>
                  ) : null}
                </div>
              </div>
              {p.title ? <p className="mt-1 font-semibold">{p.title}</p> : null}
              <p className="mt-1 line-clamp-4 whitespace-pre-line text-ink-soft">{p.body}</p>
              {p.moderation_note ? <p className="mt-2 text-sm text-danger">Moderator note: {p.moderation_note}</p> : null}
            </li>
          ))}
          {!posts?.length ? <li className="text-ink-muted">Nothing posted yet.</li> : null}
        </ul>
      </section>
    </div>
  );
}
