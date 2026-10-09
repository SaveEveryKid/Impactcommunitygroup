import type { Metadata } from "next";
import Link from "next/link";
import { Newspaper } from "lucide-react";
import { Container, EmptyState, PageHeader } from "@/components/ui/misc";
import { PostCard, type FeedPost } from "@/components/post-card";
import { getCurrentUser, getSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Community feed", description: "Updates, needs and success stories from organizations on the network.", alternates: { canonical: "/feed" } };

const SELECT = "id, kind, title, body, image_path, created_at, is_demo, organizations!inner(name, slug, status), post_reactions(reaction, user_id), post_comments(id)";

export default async function FeedPage({ searchParams }: { searchParams: Promise<{ view?: string; before?: string; kind?: string }> }) {
  const sp = await searchParams;
  const supabase = await getSupabase();
  const user = await getCurrentUser();
  const following = sp.view === "following" && user;
  let posts: FeedPost[] = [];
  if (supabase) {
    let followIds: string[] = [];
    if (following) {
      const { data } = await supabase.from("follows").select("org_id").eq("user_id", user!.id);
      followIds = (data ?? []).map((f) => f.org_id);
    }
    // Simple reverse-chronological feed: no engagement ranking.
    let q = supabase.from("posts").select(SELECT).eq("status", "published").eq("organizations.status", "approved").order("created_at", { ascending: false }).limit(20);
    if (following) q = q.in("org_id", followIds.length ? followIds : ["00000000-0000-0000-0000-000000000000"]);
    if (sp.kind && /^[a-z_]+$/.test(sp.kind)) q = q.eq("kind", sp.kind);
    if (sp.before && !Number.isNaN(Date.parse(sp.before))) q = q.lt("created_at", sp.before);
    const { data } = await q;
    posts = (data ?? []) as unknown as FeedPost[];
  }
  const tab = (v: string | undefined, label: string) => (
    <Link href={v ? `/feed?view=${v}` : "/feed"} aria-current={(sp.view ?? undefined) === v ? "page" : undefined} className="rounded-full px-4 py-2 font-semibold aria-[current=page]:bg-ink aria-[current=page]:text-white hover:bg-ink/5 aria-[current=page]:hover:bg-ink">{label}</Link>
  );
  return (
    <>
      <PageHeader title="Community feed" lede="What organizations on the network are doing and what they need, newest first.">
        <nav aria-label="Feed view" className="mt-6 flex gap-2">
          {tab(undefined, "Everyone")}
          {user ? tab("following", "Following") : null}
        </nav>
      </PageHeader>
      <Container className="max-w-2xl space-y-4 py-10">
        {posts.length ? posts.map((p) => <PostCard key={p.id} post={p} />) : (
          <EmptyState icon={Newspaper} title={following ? "Nothing from organizations you follow yet" : "No updates yet"}>
            {following ? "Follow organizations from their profile pages to see their updates here." : "Approved organizations can post updates from their dashboard."}
          </EmptyState>
        )}
        {posts.length === 20 ? (
          <Link href={`/feed?${new URLSearchParams({ ...(sp.view ? { view: sp.view } : {}), before: posts[posts.length - 1].created_at })}`} className="inline-block font-semibold text-teal-strong underline">Older posts</Link>
        ) : null}
      </Container>
    </>
  );
}
