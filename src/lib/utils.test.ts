import { describe, expect, it } from "vitest";
import { distanceMiles, formatCurrency, safeRedirectPath, slugify } from "./utils";
import { signUpSchema, organizationSchema, eventSchema } from "./validation";

describe("safeRedirectPath", () => {
  it("allows same-origin paths only", () => {
    expect(safeRedirectPath("/dashboard/org/1")).toBe("/dashboard/org/1");
    expect(safeRedirectPath("https://evil.example")).toBe("/dashboard");
    expect(safeRedirectPath("//evil.example")).toBe("/dashboard");
    expect(safeRedirectPath("/\\evil.example")).toBe("/dashboard");
    expect(safeRedirectPath(null, "/x")).toBe("/x");
  });
});

describe("slugify", () => {
  it("creates URL-safe slugs", () => {
    expect(slugify("St. Mary's Food & Clothing Pantry!")).toBe("st-mary-s-food-and-clothing-pantry");
    expect(slugify("  Café Ñandú  ")).toBe("cafe-nandu");
  });
});

describe("formatting", () => {
  it("formats currency from cents", () => {
    expect(formatCurrency(123456)).toBe("$1,234.56");
  });
  it("computes distance", () => {
    // Florence, AL to Muscle Shoals, AL is about 4 miles
    expect(distanceMiles({ lat: 34.7998, lng: -87.6773 }, { lat: 34.7448, lng: -87.6675 })).toBeGreaterThan(3);
    expect(distanceMiles({ lat: 34.7998, lng: -87.6773 }, { lat: 34.7448, lng: -87.6675 })).toBeLessThan(5);
  });
});

describe("validation", () => {
  it("requires strong passwords, age and terms on sign-up", () => {
    const bad = signUpSchema.safeParse({ display_name: "A", email: "a@b.co", password: "short" });
    expect(bad.success).toBe(false);
    const ok = signUpSchema.safeParse({ display_name: "A", email: "A@B.co ", password: "longenough1", age_confirmation: "adult", accept_terms: "on" });
    expect(ok.success && ok.data.email).toBe("a@b.co");
  });

  it("normalises organization websites and validates EIN", () => {
    const r = organizationSchema.safeParse({
      name: "Helping Hands",
      org_type: "nonprofit",
      mission: "We help families in the Shoals.",
      pillars: ["social"],
      city: "Florence",
      region: "AL",
      website_url: "helpinghands.org",
      ein: "12-3456789",
    });
    expect(r.success && r.data.website_url).toBe("https://helpinghands.org");
    expect(organizationSchema.safeParse({ ...r.data, ein: "123" }).success).toBe(false);
  });

  it("rejects events that end before they start", () => {
    const r = eventSchema.safeParse({
      title: "Meal",
      event_type: "community_meal",
      starts_at: "2026-11-01T18:00",
      ends_at: "2026-11-01T17:00",
      is_virtual: false,
      visibility: "public",
      publish: false,
    });
    expect(r.success).toBe(false);
  });
});

import { utcToZonedLocal, zonedLocalToUtc } from "./utils";
describe("time zones", () => {
  it("converts Central time to UTC across DST", () => {
    expect(zonedLocalToUtc("2026-07-04T18:00", "America/Chicago")).toBe("2026-07-04T23:00:00.000Z"); // CDT -5
    expect(zonedLocalToUtc("2026-12-24T18:00", "America/Chicago")).toBe("2026-12-25T00:00:00.000Z"); // CST -6
    expect(zonedLocalToUtc("garbage")).toBeNull();
  });
  it("round-trips", () => {
    expect(utcToZonedLocal("2026-12-25T00:00:00.000Z", "America/Chicago")).toBe("2026-12-24T18:00");
  });
});
