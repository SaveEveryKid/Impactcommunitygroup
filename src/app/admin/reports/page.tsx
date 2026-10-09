import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { lockConversation, resolveReport } from "@/app/actions/admin";
import { requirePlatformStaff } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";

type Report = { id: string; target_type: string; target_id: string; reason: string; details: string | null; status: string; created_at: string; profiles: { display_name: string } | null };

async function preview(supabase: Awaited<ReturnType<typeof requirePlatformStaff>>["supabase"], r: Report): Promise<{ text: string; href?: string; conversationId?: string }> {
  switch (r.target_type) {
    case "post": {
      const { data } = await supabase.from("posts").select("body, status").eq("id", r.target_id).maybeSingle();
      return { text: data ? `[${data.status}] ${data.body}` : "(deleted)", href: `/feed/${r.target_id}` };
    }
    case "comment": {
      const { data } = await supabase.from("post_comments").select("body, post_id").eq("id", r.target_id).maybeSingle();
      return { text: data?.body ?? "(deleted)", href: data ? `/feed/${data.post_id}` : undefined };
    }
    case "message": {
      const { data } = await supabase.from("messages").select("body, conversation_id, hidden_at").eq("id", r.target_id).maybeSingle();
      return { text: data ? `${data.hidden_at ? "[hidden] " : ""}${data.body}` : "(deleted)", conversationId: data?.conversation_id };
    }
    case "organization": {
      const { data } = await supabase.from("organizations").select("name, slug").eq("id", r.target_id).maybeSingle();
      return { text: data?.name ?? "(deleted)", href: data ? `/organizations/${data.slug}` : undefined };
    }
    case "resource": return { text: "Resource listing", href: `/resources/${r.target_id}` };
    case "event": return { text: "Event", href: `/events/${r.target_id}` };
    case "opportunity": return { text: "Volunteer opportunity", href: `/volunteer/${r.target_id}` };
    default: return { text: r.target_type };
  }
}

export default async function AdminReports({ searchParams }: { searchParams: Promise<{ error?: string; closed?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requirePlatformStaff("moderator");
  const { data } = await supabase
    .from("content_reports")
    .select("id, target_type, target_id, reason, details, status, created_at, profiles:reporter_id(display_name)")
    .in("status", sp.closed ? ["resolved", "dismissed"] : ["open", "reviewing"])
    .order("created_at")
    .limit(100);
  const reports = (data ?? []) as unknown as Report[];
  const previews = await Promise.all(reports.map((r) => preview(supabase, r)));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Reported content</h2>
        <Link href={sp.closed ? "/admin/reports" : "/admin/reports?closed=1"} className="font-semibold text-teal-strong underline">{sp.closed ? "Open reports" : "Closed reports"}</Link>
      </div>
      {sp.error ? <FormMessage tone="error">{sp.error}</FormMessage> : null}
      {!reports.length ? <p className="text-ink-muted">No reports here.</p> : null}
      {reports.map((r, i) => (
        <article key={r.id} className="rounded-[var(--radius-lg)] border border-line bg-surface p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="danger">{r.reason}</Badge><Badge>{r.target_type}</Badge><Badge tone={r.status === "open" ? "warn" : "neutral"}>{r.status}</Badge>
            <span className="text-sm text-ink-muted">by {r.profiles?.display_name ?? "a member"}, {formatDateTime(r.created_at)}</span>
          </div>
          {r.details ? <p className="mt-2">&ldquo;{r.details}&rdquo;</p> : null}
          <blockquote className="mt-3 line-clamp-6 whitespace-pre-line rounded-[10px] bg-paper p-3 text-ink-soft">{previews[i].text}</blockquote>
          {previews[i].href ? <Link href={previews[i].href!} className="mt-2 inline-block text-sm font-semibold text-teal-strong underline">Open in context</Link> : null}
          {["open", "reviewing"].includes(r.status) ? (
            <form action={resolveReport} className="mt-4 flex flex-col gap-2">
              <input type="hidden" name="report_id" value={r.id} />
              <input name="note" maxLength={2000} placeholder="Resolution note (logged)" aria-label="Resolution note" className="h-10 rounded-[10px] border border-line-strong px-3" />
              <div className="flex flex-wrap gap-2">
                {["post", "comment", "message"].includes(r.target_type) ? (<><Button type="submit" name="action" value="hide" size="sm">Hide content</Button><Button type="submit" name="action" value="remove" size="sm" variant="danger">Remove content</Button></>) : null}
                <Button type="submit" name="action" value="dismiss" size="sm" variant="secondary">Dismiss report</Button>
                {r.status === "open" ? <Button type="submit" name="action" value="review" size="sm" variant="ghost">Mark reviewing</Button> : null}
                {["organization", "user", "resource", "event", "opportunity"].includes(r.target_type) ? <span className="self-center text-sm text-ink-muted">Suspend organizations from the Organizations tab.</span> : null}
              </div>
            </form>
          ) : null}
          {previews[i].conversationId ? (
            <form action={lockConversation} className="mt-2"><input type="hidden" name="conversation_id" value={previews[i].conversationId} /><input type="hidden" name="lock" value="true" /><Button type="submit" size="sm" variant="ghost">Lock this conversation</Button></form>
          ) : null}
        </article>
      ))}
    </div>
  );
}
