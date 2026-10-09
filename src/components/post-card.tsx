import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/misc";
import { formatDateTime, mediaUrl } from "@/lib/utils";

export type FeedPost = {
  id: string;
  kind: string;
  title: string | null;
  body: string;
  image_path: string | null;
  created_at: string;
  is_demo: boolean;
  organizations: { name: string; slug: string } | null;
  post_reactions: { reaction: string; user_id: string }[];
  post_comments: { id: string }[];
};

const KIND: Record<string, string> = {
  update: "Update",
  announcement: "Announcement",
  success_story: "Success story",
  volunteer_request: "Volunteers needed",
  community_need: "Community need",
  event: "Event",
  partnership: "Partnership opportunity",
};

export function PostCard({ post, truncate = true }: { post: FeedPost; truncate?: boolean }) {
  const img = mediaUrl(post.image_path);
  return (
    <article className="rounded-[var(--radius-lg)] border border-line bg-surface p-5">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link href={`/organizations/${post.organizations?.slug}`} className="font-semibold hover:underline">{post.organizations?.name}</Link>
        <Badge tone={post.kind === "community_need" || post.kind === "volunteer_request" ? "warn" : post.kind === "success_story" ? "teal" : "neutral"}>{KIND[post.kind] ?? post.kind}</Badge>
        {post.is_demo ? <Badge tone="marigold">Demo</Badge> : null}
        <span className="text-sm text-ink-muted">{formatDateTime(post.created_at)}</span>
      </header>
      {post.title ? <h2 className="mt-3 text-xl font-semibold">{post.title}</h2> : null}
      <p className={`mt-2 whitespace-pre-line text-ink-soft ${truncate ? "line-clamp-6" : ""}`}>{post.body}</p>
      {img ? (
        <div className="relative mt-4 aspect-[16/9] overflow-hidden rounded-[14px] bg-paper">
          <Image src={img} alt="" fill sizes="(max-width: 768px) 100vw, 640px" className="object-cover" />
        </div>
      ) : null}
      {truncate ? (
        <Link href={`/feed/${post.id}`} className="mt-3 inline-block text-sm font-semibold text-teal-strong hover:underline">
          {post.post_comments.length ? `${post.post_comments.length} comment${post.post_comments.length > 1 ? "s" : ""}` : "Comment"}
          {post.post_reactions.length ? `, ${post.post_reactions.length} reaction${post.post_reactions.length > 1 ? "s" : ""}` : ""}
        </Link>
      ) : null}
    </article>
  );
}
