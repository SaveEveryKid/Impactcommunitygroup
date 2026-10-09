import "server-only";
import { getSupabase } from "@/lib/supabase/server";
import type { Pillar } from "@/lib/constants";

export const PAGE_SIZE = 12;

export type OrgCard = {
  id: string;
  slug: string;
  name: string;
  org_type: string;
  mission: string | null;
  logo_path: string | null;
  cover_path: string | null;
  pillars: Pillar[];
  city: string | null;
  region: string | null;
  verification_level: "unverified" | "identity_verified" | "tax_exempt_verified";
  is_demo: boolean;
};

const ORG_CARD_COLS = "id, slug, name, org_type, mission, logo_path, cover_path, pillars, city, region, verification_level, is_demo";

export type ListResult<T> = { connected: boolean; rows: T[]; total: number; page: number; pageCount: number };

function empty<T>(page = 1): ListResult<T> {
  return { connected: false, rows: [], total: 0, page, pageCount: 0 };
}

function pageRange(page: number) {
  const p = Math.max(1, Math.floor(page) || 1);
  return { p, from: (p - 1) * PAGE_SIZE, to: p * PAGE_SIZE - 1 };
}

/** Escape user input for PostgREST ilike/or filters. */
function safeTerm(q?: string) {
  return (q ?? "").replace(/[%_,()*\\:."']/g, " ").trim().slice(0, 80);
}

export async function listOrganizations(opts: { q?: string; pillar?: string; type?: string; city?: string; page?: number; featured?: boolean }) {
  const supabase = await getSupabase();
  if (!supabase) return empty<OrgCard>(opts.page);
  const { p, from, to } = pageRange(opts.page ?? 1);
  let query = supabase
    .from("organizations")
    .select(ORG_CARD_COLS, { count: "exact" })
    .eq("status", "approved")
    .is("deleted_at", null);
  const term = safeTerm(opts.q);
  if (term) query = query.or(`name.ilike.%${term}%,mission.ilike.%${term}%,description.ilike.%${term}%`);
  if (opts.pillar) query = query.contains("pillars", [opts.pillar]);
  if (opts.type) query = query.eq("org_type", opts.type);
  const city = safeTerm(opts.city);
  if (city) query = query.ilike("city", `%${city}%`);
  if (opts.featured) query = query.eq("is_featured", true);
  const { data, count, error } = await query.order("is_featured", { ascending: false }).order("name").range(from, to);
  if (error) throw new Error(`Could not load organizations: ${error.message}`);
  const total = count ?? 0;
  return { connected: true, rows: (data ?? []) as OrgCard[], total, page: p, pageCount: Math.ceil(total / PAGE_SIZE) };
}

export async function getOrganizationBySlug(slug: string) {
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data } = await supabase
    .from("organizations")
    .select(
      "id, slug, name, org_type, mission, description, logo_path, cover_path, pillars, service_categories, service_area, city, region, public_email, public_phone, website_url, social_links, status, verification_level, is_demo, created_at, approved_at",
    )
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}

export type OpportunityCard = {
  id: string;
  title: string;
  summary: string | null;
  pillars: Pillar[];
  general_location: string | null;
  is_virtual: boolean;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;
  capacity: number | null;
  allows_minors: boolean;
  skills_required: string[];
  is_demo: boolean;
  organizations: { slug: string; name: string; verification_level: string } | null;
};

export async function listOpportunities(opts: { q?: string; pillar?: string; virtual?: boolean; orgId?: string; page?: number; upcomingOnly?: boolean; limit?: number }) {
  const supabase = await getSupabase();
  if (!supabase) return empty<OpportunityCard>(opts.page);
  const { p, from, to } = pageRange(opts.page ?? 1);
  let query = supabase
    .from("volunteer_opportunities")
    .select(
      "id, title, summary, pillars, general_location, is_virtual, starts_at, ends_at, timezone, capacity, allows_minors, skills_required, is_demo, organizations!inner(slug, name, verification_level, status)",
      { count: "exact" },
    )
    .eq("status", "published")
    .eq("organizations.status", "approved");
  const term = safeTerm(opts.q);
  if (term) query = query.or(`title.ilike.%${term}%,summary.ilike.%${term}%,description.ilike.%${term}%`);
  if (opts.pillar) query = query.contains("pillars", [opts.pillar]);
  if (opts.virtual) query = query.eq("is_virtual", true);
  if (opts.orgId) query = query.eq("org_id", opts.orgId);
  if (opts.upcomingOnly !== false) query = query.or(`ends_at.is.null,ends_at.gte.${new Date().toISOString()}`);
  const { data, count, error } = await query
    .order("starts_at", { ascending: true, nullsFirst: false })
    .range(from, opts.limit ? from + opts.limit - 1 : to);
  if (error) throw new Error(`Could not load opportunities: ${error.message}`);
  const total = count ?? 0;
  return { connected: true, rows: (data ?? []) as unknown as OpportunityCard[], total, page: p, pageCount: Math.ceil(total / PAGE_SIZE) };
}

export type EventCard = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  event_type: string;
  pillars: Pillar[];
  cover_path: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  is_virtual: boolean;
  venue_name: string | null;
  general_location: string | null;
  capacity: number | null;
  price_cents: number;
  status: string;
  is_demo: boolean;
  organizations: { slug: string; name: string } | null;
};

export async function listEvents(opts: { q?: string; pillar?: string; type?: string; from?: string; orgId?: string; page?: number; limit?: number; past?: boolean }) {
  const supabase = await getSupabase();
  if (!supabase) return empty<EventCard>(opts.page);
  const { p, from, to } = pageRange(opts.page ?? 1);
  let query = supabase
    .from("events")
    .select(
      "id, slug, title, summary, event_type, pillars, cover_path, starts_at, ends_at, timezone, is_virtual, venue_name, general_location, capacity, price_cents, status, is_demo, organizations!inner(slug, name, status)",
      { count: "exact" },
    )
    .eq("visibility", "public")
    .eq("organizations.status", "approved");
  if (opts.past) query = query.in("status", ["completed", "published"]).lt("ends_at", new Date().toISOString());
  else query = query.in("status", ["published", "cancelled"]).gte("ends_at", opts.from ?? new Date().toISOString());
  const term = safeTerm(opts.q);
  if (term) query = query.or(`title.ilike.%${term}%,summary.ilike.%${term}%`);
  if (opts.pillar) query = query.contains("pillars", [opts.pillar]);
  if (opts.type) query = query.eq("event_type", opts.type);
  if (opts.orgId) query = query.eq("org_id", opts.orgId);
  const { data, count, error } = await query.order("starts_at", { ascending: !opts.past }).range(from, opts.limit ? from + opts.limit - 1 : to);
  if (error) throw new Error(`Could not load events: ${error.message}`);
  const total = count ?? 0;
  return { connected: true, rows: (data ?? []) as unknown as EventCard[], total, page: p, pageCount: Math.ceil(total / PAGE_SIZE) };
}

export type ResourceCard = {
  id: string;
  kind: "offer" | "need";
  title: string;
  description: string | null;
  category: string;
  quantity_total: number;
  quantity_available: number;
  unit: string;
  general_location: string | null;
  fulfillment: string;
  is_perishable: boolean;
  expires_at: string | null;
  status: string;
  photo_paths: string[];
  created_at: string;
  is_demo: boolean;
  organizations: { id: string; slug: string; name: string } | null;
};

export async function listResources(opts: { q?: string; kind?: string; category?: string; orgId?: string; page?: number; limit?: number }) {
  const supabase = await getSupabase();
  if (!supabase) return empty<ResourceCard>(opts.page);
  const { p, from, to } = pageRange(opts.page ?? 1);
  let query = supabase
    .from("resources")
    .select(
      "id, kind, title, description, category, quantity_total, quantity_available, unit, general_location, fulfillment, is_perishable, expires_at, status, photo_paths, created_at, is_demo, organizations!inner(id, slug, name, status)",
      { count: "exact" },
    )
    .eq("status", "published")
    .eq("organizations.status", "approved")
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
  const term = safeTerm(opts.q);
  if (term) query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
  if (opts.kind === "offer" || opts.kind === "need") query = query.eq("kind", opts.kind);
  if (opts.category) query = query.eq("category", opts.category);
  if (opts.orgId) query = query.eq("org_id", opts.orgId);
  const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, opts.limit ? from + opts.limit - 1 : to);
  if (error) throw new Error(`Could not load resources: ${error.message}`);
  const total = count ?? 0;
  return { connected: true, rows: (data ?? []) as unknown as ResourceCard[], total, page: p, pageCount: Math.ceil(total / PAGE_SIZE) };
}

export type ImpactRow = { metric: string; verification: "verified" | "self_reported" | "estimated"; total: number; records: number };

export async function getPublicImpact(): Promise<{ connected: boolean; rows: ImpactRow[] }> {
  const supabase = await getSupabase();
  if (!supabase) return { connected: false, rows: [] };
  const { data, error } = await supabase.rpc("public_impact_summary");
  if (error) throw new Error(`Could not load impact: ${error.message}`);
  return { connected: true, rows: ((data ?? []) as ImpactRow[]).map((r) => ({ ...r, total: Number(r.total), records: Number(r.records) })) };
}

export function impactValue(rows: ImpactRow[], metric: string, verification: ImpactRow["verification"] = "verified") {
  return rows.filter((r) => r.metric === metric && r.verification === verification).reduce((a, r) => a + r.total, 0);
}
