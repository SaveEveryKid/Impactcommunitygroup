import "server-only";
import { getSupabase } from "@/lib/supabase/server";
import type { OpportunityCard } from "@/lib/queries";
import type { Pillar, ResourceCategory } from "@/lib/constants";
import { scoreOpportunity, scoreResource, topMatches } from "@/lib/matching-core";

export async function recommendOpportunities(userId: string, limit = 3) {
  const supabase = await getSupabase();
  if (!supabase) return [];
  const [{ data: prefs }, { data: applied }, { data: opps }] = await Promise.all([
    supabase.from("volunteer_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("volunteer_applications").select("opportunity_id").eq("user_id", userId),
    supabase
      .from("volunteer_opportunities")
      .select(
        "id, title, summary, pillars, general_location, is_virtual, starts_at, ends_at, timezone, capacity, allows_minors, skills_required, is_demo, approx_lat, approx_lng, organizations!inner(slug, name, verification_level, status)",
      )
      .eq("status", "published")
      .eq("organizations.status", "approved")
      .or(`ends_at.is.null,ends_at.gte.${new Date().toISOString()}`)
      .limit(200),
  ]);
  if (!prefs || !opps) return [];
  const appliedIds = new Set((applied ?? []).map((a) => a.opportunity_id));
  const scored = (opps as unknown as (OpportunityCard & { approx_lat: number | null; approx_lng: number | null })[])
    .filter((o) => !appliedIds.has(o.id))
    .map((o) =>
      scoreOpportunity(o, {
        interests: (prefs.interests ?? []) as Pillar[],
        skills: prefs.skills ?? [],
        service_areas: prefs.service_areas ?? [],
        availability: (prefs.availability ?? {}) as Record<string, boolean>,
        max_distance_miles: prefs.max_distance_miles,
      }),
    );
  return topMatches(scored, limit).map((s) => ({ opp: s.item as OpportunityCard, reasons: s.reasons }));
}

export async function recommendResourcesForOrg(orgId: string, limit = 6) {
  const supabase = await getSupabase();
  if (!supabase) return [];
  const [{ data: org }, { data: needs }, { data: resources }] = await Promise.all([
    supabase.from("organizations").select("id, pillars, service_categories, city, approx_lat, approx_lng").eq("id", orgId).maybeSingle(),
    supabase.from("resources").select("category").eq("org_id", orgId).eq("kind", "need").in("status", ["published", "fully_reserved"]),
    supabase
      .from("resources")
      .select("id, org_id, kind, title, description, category, pillars, quantity_total, quantity_available, unit, general_location, fulfillment, is_perishable, expires_at, status, photo_paths, created_at, is_demo, approx_lat, approx_lng, organizations!inner(id, slug, name, status)")
      .eq("status", "published")
      .eq("kind", "offer")
      .eq("organizations.status", "approved")
      .neq("org_id", orgId)
      .limit(300),
  ]);
  if (!org || !resources) return [];
  const profile = {
    id: org.id,
    pillars: (org.pillars ?? []) as Pillar[],
    service_categories: org.service_categories ?? [],
    city: org.city,
    needCategories: (needs ?? []).map((n) => n.category as ResourceCategory),
    approx_lat: org.approx_lat,
    approx_lng: org.approx_lng,
  };
  type Row = (typeof resources)[number];
  const scored = resources.map((r) => scoreResource({ ...r, quantity_available: Number(r.quantity_available) } as Row & { quantity_available: number; category: ResourceCategory; pillars: Pillar[] }, profile));
  return topMatches(scored, limit).map((s) => ({ resource: s.item, reasons: s.reasons }));
}
