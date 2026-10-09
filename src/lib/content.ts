import "server-only";
import { cache } from "react";
import { getSupabase } from "@/lib/supabase/server";

export type ContentBlock = { title: string | null; body: string | null; data: Record<string, unknown> };

/** Admin-editable content blocks with code-defined fallbacks. */
export const getSiteContent = cache(async (key: string): Promise<ContentBlock | null> => {
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.from("site_content").select("title, body, data").eq("key", key).maybeSingle();
  return (data as ContentBlock) ?? null;
});

export type Sponsor = { name: string; url?: string; tier?: string; note?: string };

export async function getSponsors(): Promise<Sponsor[]> {
  const block = await getSiteContent("partners.sponsors");
  const list = (block?.data?.sponsors ?? []) as Sponsor[];
  return Array.isArray(list) ? list.filter((s) => s && typeof s.name === "string") : [];
}
