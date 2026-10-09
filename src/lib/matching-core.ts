/**
 * Transparent, rule-based matching. Every point awarded has a human-readable
 * reason, so users (and funders) can see why something was recommended.
 * No external AI services are used.
 */
import { PILLAR_META, RESOURCE_CATEGORY_LABEL, type Pillar, type ResourceCategory } from "@/lib/constants";
import { distanceMiles } from "@/lib/utils";

export type Scored<T> = { item: T; score: number; reasons: string[] };

export type VolunteerPrefs = {
  interests: Pillar[];
  skills: string[];
  service_areas: string[];
  availability: Record<string, boolean>;
  lat?: number | null;
  lng?: number | null;
  max_distance_miles?: number | null;
};

export type OppForMatch = {
  pillars: Pillar[];
  skills_required: string[];
  general_location: string | null;
  is_virtual: boolean;
  starts_at: string | null;
  approx_lat?: number | null;
  approx_lng?: number | null;
};

const norm = (s: string) => s.trim().toLowerCase();

export function scoreOpportunity<T extends OppForMatch>(opp: T, prefs: VolunteerPrefs, now = new Date()): Scored<T> {
  let score = 0;
  const reasons: string[] = [];

  const pillarHits = opp.pillars.filter((p) => prefs.interests.includes(p));
  if (pillarHits.length) {
    score += 3 * pillarHits.length;
    reasons.push(`Matches your interest in ${pillarHits.map((p) => PILLAR_META[p].label.toLowerCase()).join(" and ")}`);
  }

  const mySkills = new Set(prefs.skills.map(norm));
  const skillHits = opp.skills_required.filter((s) => mySkills.has(norm(s)));
  if (skillHits.length) {
    score += 2 * skillHits.length;
    reasons.push(`Uses your skills: ${skillHits.join(", ")}`);
  }

  if (opp.is_virtual) {
    score += 1;
    reasons.push("Can be done remotely");
  } else {
    const loc = norm(opp.general_location ?? "");
    const area = prefs.service_areas.find((a) => a && loc.includes(norm(a)));
    if (area) {
      score += 3;
      reasons.push(`In ${area}`);
    }
    if (prefs.lat != null && prefs.lng != null && opp.approx_lat != null && opp.approx_lng != null) {
      const d = distanceMiles({ lat: prefs.lat, lng: prefs.lng }, { lat: opp.approx_lat, lng: opp.approx_lng });
      const max = prefs.max_distance_miles ?? 25;
      if (d <= max) {
        score += d <= 5 ? 3 : d <= 15 ? 2 : 1;
        reasons.push(`About ${Math.round(d)} miles away`);
      } else {
        score -= 3;
      }
    }
  }

  if (opp.starts_at) {
    const start = new Date(opp.starts_at);
    const day = start.getUTCDay();
    const weekend = day === 0 || day === 6;
    if ((weekend && prefs.availability.weekends) || (!weekend && (prefs.availability.weekdays || prefs.availability.weekday_evenings))) {
      score += 1;
      reasons.push(weekend ? "On a weekend, when you're available" : "On a weekday, when you're available");
    }
    const days = (start.getTime() - now.getTime()) / 86_400_000;
    if (days >= 0 && days <= 14) {
      score += 1;
      reasons.push("Happening in the next two weeks");
    }
  }

  return { item: opp, score, reasons };
}

export type OrgProfileForMatch = {
  id: string;
  pillars: Pillar[];
  service_categories: string[];
  city: string | null;
  needCategories: ResourceCategory[];
  approx_lat?: number | null;
  approx_lng?: number | null;
};

export type ResourceForMatch = {
  org_id: string;
  category: ResourceCategory;
  pillars: Pillar[];
  title: string;
  description: string | null;
  general_location: string | null;
  quantity_available: number;
  expires_at: string | null;
  approx_lat?: number | null;
  approx_lng?: number | null;
};

export function scoreResource<T extends ResourceForMatch>(r: T, org: OrgProfileForMatch, now = new Date()): Scored<T> {
  let score = 0;
  const reasons: string[] = [];
  if (r.org_id === org.id || r.quantity_available <= 0) return { item: r, score: -Infinity, reasons };

  if (org.needCategories.includes(r.category)) {
    score += 5;
    reasons.push(`You've posted a need for ${RESOURCE_CATEGORY_LABEL[r.category].toLowerCase()}`);
  }
  const pillarHits = r.pillars.filter((p) => org.pillars.includes(p));
  if (pillarHits.length) {
    score += 2 * pillarHits.length;
    reasons.push("Fits the well-being areas you serve");
  }
  const text = `${r.title} ${r.description ?? ""}`.toLowerCase();
  const cat = org.service_categories.find((c) => c && text.includes(norm(c)));
  if (cat) {
    score += 2;
    reasons.push(`Related to your ${cat} work`);
  }
  if (org.city && r.general_location && norm(r.general_location).includes(norm(org.city))) {
    score += 3;
    reasons.push(`In ${org.city}`);
  } else if (org.approx_lat != null && org.approx_lng != null && r.approx_lat != null && r.approx_lng != null) {
    const d = distanceMiles({ lat: org.approx_lat, lng: org.approx_lng }, { lat: r.approx_lat, lng: r.approx_lng });
    if (d <= 30) {
      score += d <= 10 ? 3 : 1;
      reasons.push(`About ${Math.round(d)} miles away`);
    }
  }
  if (r.expires_at) {
    const hours = (new Date(r.expires_at).getTime() - now.getTime()) / 3_600_000;
    if (hours > 0 && hours < 72) {
      score += 1;
      reasons.push("Needs a home within three days");
    }
  }
  return { item: r, score, reasons };
}

export function topMatches<T>(scored: Scored<T>[], limit: number, minScore = 1): Scored<T>[] {
  return scored
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
