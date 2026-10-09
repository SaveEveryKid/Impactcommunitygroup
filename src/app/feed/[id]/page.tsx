import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/misc";
import { PostCard, type FeedPost } from "@/components/post-card";
import { ReportButton } from "@/components/report-button";
import { deleteComment, toggleReaction } from "@/app/actions/feed";
import { getCurrentUser, getSupabase } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import { CommentForm } from "./comment-form";

type Params = { params: Promise<{ id: string }> };

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data } = await supabase
    .from("posts")
    .select("id, kind, title, body, image_path, created_at, is_demo, organizations(name, slug), post_reactions(reaction, user_id), post_comments(id)")
    .eq("id", id)
    .maybeSingle();
  return data as unknown as FeedPost | null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const p = await load((await params).id);
  if (!p) return { title: "Post not found" };
  return { title: p.title ?? `Update from ${p.organizations?.name}`, description: p.body.slice(0, 160), alternates: { canonical: `/feed/${p.id}` }, robots: p.is_demo ? { index: false } : undefined };
}

const REACTIONS = [
  ["support", "Support"],
  ["thanks", "Thank you"],
  ["helpful", "Helpful"],
] as const;

export default async function PostPage({ params }: Params) {
  const { id } = await params;
  const post = await load(id);
  if (!post) notFound();
  const supabase = (await getSupabase())!;
  const user = await getCurrentUser();
  const { data: comments } = await supabase
    .from("post_comments")
    .select("id, body, created_at, author_id, profiles:author_id(display_name)")
    .eq("post_id", id)
    .eq("status", "published")
    .order("created_at")
    .limit(200);
  type C = { id: string; body: string; created_at: string; author_id: string; profiles: { display_name: string } | null };
  return (
    <Container className="max-w-2xl py-10">
      <PostCard post={post} truncate={false} />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {REACTIONS.map(([r, label]) => {
          const count = post.post_reactions.filter((x) => x.reaction === r).length;
          const mine = Boolean(user && post.post_reactions.some((x) => x.reaction === r && x.user_id === user.id));
          return user ? (
            <form key={r} action={toggleReaction}>
              <input type="hidden" name="post_id" value={post.id} />
              <input type="hidden" name="reaction" value={r} />
              <input type="hidden" name="active" value={String(mine)} />
              <Button type="submit" size="sm" variant={mine ? "primary" : "secondary"} aria-pressed={mine}>{label}{count ? ` ${count}` : ""}</Button>
            </form>
          ) : (
            <span key={r} className="rounded-full border border-line px-3 py-1.5 text-sm">{label}{count ? ` ${count}` : ""}</span>
          );
        })}
        {user ? <ReportButton targetType="post" targetId={post.id} /> : null}
      </div>
      <section aria-labelledby="comments" className="mt-10">
        <h2 id="comments" className="text-xl font-semibold">Comments</h2>
        <ul className="mt-4 space-y-3">
          {((comments ?? []) as unknown as C[]).map((c) => (
            <li key={c.id} className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
              <p className="text-sm"><strong>{c.profiles?.display_name ?? "Member"}</strong> <span className="text-ink-muted">{formatDateTime(c.created_at)}</span></p>
              <p className="mt-1 whitespace-pre-line">{c.body}</p>
              <div className="mt-1 flex gap-2">
                {user?.id === c.author_id ? (
                  <form action={deleteComment}><input type="hidden" name="comment_id" value={c.id} /><input type="hidden" name="post_id" value={post.id} /><Button type="submit" size="sm" variant="ghost" className="text-danger">Delete</Button></form>
                ) : user ? <ReportButton targetType="comment" targetId={c.id} /> : null}
              </div>
            </li>
          ))}
          {!comments?.length ? <li className="text-ink-muted">No comments yet.</li> : null}
        </ul>
        <div className="mt-6">{user ? <CommentForm postId={post.id} /> : <p className="text-ink-muted">Sign in to comment.</p>}</div>
      </section>
    </Container>
  );
}
