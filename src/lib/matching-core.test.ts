import { describe, expect, it } from "vitest";
import { scoreOpportunity, scoreResource, topMatches } from "./matching-core";

const now = new Date("2026-10-10T12:00:00Z");

describe("scoreOpportunity", () => {
  const prefs = {
    interests: ["physical" as const],
    skills: ["Spanish", "driving"],
    service_areas: ["Florence"],
    availability: { weekends: true },
  };

  it("awards explained points for pillar, skill, area, schedule and recency", () => {
    const r = scoreOpportunity(
      { pillars: ["physical"], skills_required: ["spanish"], general_location: "Downtown Florence, AL", is_virtual: false, starts_at: "2026-10-17T15:00:00Z" },
      prefs,
      now,
    );
    expect(r.score).toBe(3 + 2 + 3 + 1 + 1);
    expect(r.reasons).toEqual([
      "Matches your interest in physical well-being",
      "Uses your skills: spanish",
      "In Florence",
      "On a weekend, when you're available",
      "Happening in the next two weeks",
    ]);
  });

  it("scores unrelated opportunities at zero", () => {
    const r = scoreOpportunity({ pillars: ["financial"], skills_required: [], general_location: "Huntsville", is_virtual: false, starts_at: null }, prefs, now);
    expect(r.score).toBe(0);
    expect(r.reasons).toEqual([]);
  });

  it("penalises opportunities beyond the volunteer's travel distance", () => {
    const r = scoreOpportunity(
      { pillars: [], skills_required: [], general_location: null, is_virtual: false, starts_at: null, approx_lat: 34.73, approx_lng: -86.58 },
      { ...prefs, lat: 34.8, lng: -87.68, max_distance_miles: 10 },
      now,
    );
    expect(r.score).toBeLessThan(0);
  });
});

describe("scoreResource", () => {
  const org = { id: "me", pillars: ["physical" as const], service_categories: ["food pantry"], city: "Sheffield", needCategories: ["food" as const] };
  const base = { org_id: "other", category: "food" as const, pillars: ["physical" as const], title: "Produce for a food pantry", description: null, general_location: "Sheffield, AL", quantity_available: 50, expires_at: "2026-10-11T12:00:00Z" };

  it("prioritises posted needs and nearby perishables", () => {
    const r = scoreResource(base, org, now);
    expect(r.score).toBe(5 + 2 + 2 + 3 + 1);
  });

  it("never recommends your own listing or empty listings", () => {
    expect(scoreResource({ ...base, org_id: "me" }, org, now).score).toBe(-Infinity);
    expect(scoreResource({ ...base, quantity_available: 0 }, org, now).score).toBe(-Infinity);
  });

  it("topMatches filters and orders", () => {
    const list = [
      { item: "a", score: 1, reasons: [] },
      { item: "b", score: 9, reasons: [] },
      { item: "c", score: 0, reasons: [] },
    ];
    expect(topMatches(list, 5).map((s) => s.item)).toEqual(["b", "a"]);
  });
});
