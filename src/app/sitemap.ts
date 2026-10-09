import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { appEnv, isSupabaseConfigured, siteUrl, supabaseAnonKey, supabaseUrl } from "@/lib/env";

export const revalidate = 3600;

const STATIC = ["", "/about", "/how-it-works", "/organizations", "/volunteer", "/events", "/resources", "/feed", "/impact", "/partners", "/support", "/contact", "/faq", "/privacy", "/terms", "/guidelines", "/accessibility"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (appEnv === "demo") return [];
  const entries: MetadataRoute.Sitemap = STATIC.map((p) => ({ url: `${siteUrl}${p}`, changeFrequency: "weekly", priority: p === "" ? 1 : 0.7 }));
  if (!isSupabaseConfigured) return entries;
  // Anonymous client: only publicly visible, non-demo rows are listed.
  const sb = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
  const [orgs, events, opps] = await Promise.all([
    sb.from("organizations").select("slug, updated_at").eq("status", "approved").eq("is_demo", false).is("deleted_at", null).limit(5000),
    sb.from("events").select("id, updated_at").eq("status", "published").eq("visibility", "public").eq("is_demo", false).gte("ends_at", new Date().toISOString()).limit(5000),
    sb.from("volunteer_opportunities").select("id, updated_at").eq("status", "published").eq("is_demo", false).limit(5000),
  ]);
  for (const o of orgs.data ?? []) entries.push({ url: `${siteUrl}/organizations/${o.slug}`, lastModified: o.updated_at });
  for (const e of events.data ?? []) entries.push({ url: `${siteUrl}/events/${e.id}`, lastModified: e.updated_at });
  for (const v of opps.data ?? []) entries.push({ url: `${siteUrl}/volunteer/${v.id}`, lastModified: v.updated_at });
  return entries;
}
