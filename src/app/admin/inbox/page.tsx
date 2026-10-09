import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { updateContactMessage } from "@/app/actions/admin";
import { requirePlatformStaff } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";

export default async function AdminInbox() {
  const { supabase } = await requirePlatformStaff("moderator");
  const { data } = await supabase.from("contact_messages").select("*").in("status", ["new", "in_progress"]).order("created_at").limit(100);
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Contact form messages</h2>
      {!data?.length ? <p className="text-ink-muted">No open messages.</p> : null}
      {(data ?? []).map((m) => (
        <article key={m.id} className="rounded-[var(--radius-lg)] border border-line bg-surface p-5">
          <div className="flex flex-wrap items-center gap-2"><strong>{m.name}</strong><a href={`mailto:${m.email}`} className="text-teal-strong underline">{m.email}</a><Badge tone={m.topic === "safety" ? "danger" : "neutral"}>{m.topic}</Badge><Badge>{m.status}</Badge><span className="text-sm text-ink-muted">{formatDateTime(m.created_at)}</span></div>
          <p className="mt-3 whitespace-pre-line">{m.message}</p>
          <form action={updateContactMessage} className="mt-3 flex flex-wrap gap-2">
            <input type="hidden" name="id" value={m.id} />
            {m.status === "new" ? <Button type="submit" name="status" value="in_progress" size="sm" variant="secondary">Mark in progress</Button> : null}
            <Button type="submit" name="status" value="closed" size="sm">Close</Button>
            <Button type="submit" name="status" value="spam" size="sm" variant="ghost">Spam</Button>
          </form>
        </article>
      ))}
    </div>
  );
}
