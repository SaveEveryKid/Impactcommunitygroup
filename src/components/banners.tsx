import { Info } from "lucide-react";
import { appEnv } from "@/lib/env";
import { getSupabase } from "@/lib/supabase/server";
import { Container } from "@/components/ui/misc";

export function EnvironmentBanner() {
  if (appEnv !== "demo") return null;
  return (
    <div role="note" className="bg-marigold text-ink">
      <Container className="flex items-center gap-2 py-2 text-sm font-semibold">
        <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
        Demonstration environment. Every organization, person and number here is fictional and is not real activity.
      </Container>
    </div>
  );
}

export async function AnnouncementBar() {
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data } = await supabase
    .from("site_announcements")
    .select("id, title, body, link_url, severity")
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const tone = data.severity === "warning" ? "bg-warn-wash text-warn" : data.severity === "success" ? "bg-teal-wash text-teal-strong" : "bg-ink text-white";
  return (
    <div role="region" aria-label="Site announcement" className={tone}>
      <Container className="py-2.5 text-[0.95rem]">
        <strong className="font-semibold">{data.title}</strong>
        {data.body ? <span> {data.body}</span> : null}
        {data.link_url ? (
          <a href={data.link_url} className="ml-2 underline underline-offset-2">
            Learn more
          </a>
        ) : null}
      </Container>
    </div>
  );
}
