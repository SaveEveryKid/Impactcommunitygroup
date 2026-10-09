import type { LucideIcon } from "lucide-react";
import { Brain, HeartPulse, Users, Sparkles, PiggyBank } from "lucide-react";

export const PILLARS = ["mental", "physical", "social", "spiritual", "financial"] as const;
export type Pillar = (typeof PILLARS)[number];

export const PILLAR_META: Record<Pillar, { label: string; blurb: string; icon: LucideIcon; color: string }> = {
  mental: {
    label: "Mental well-being",
    blurb: "Support groups, counseling referrals, quiet spaces and people who check in.",
    icon: Brain,
    color: "var(--pillar-mental)",
  },
  physical: {
    label: "Physical well-being",
    blurb: "Food, clothing, safe shelter, health fairs and getting people to appointments.",
    icon: HeartPulse,
    color: "var(--pillar-physical)",
  },
  social: {
    label: "Social well-being",
    blurb: "Community meals, mentoring, and the neighbors who make a place feel like home.",
    icon: Users,
    color: "var(--pillar-social)",
  },
  spiritual: {
    label: "Spiritual well-being",
    blurb: "Faith communities and purpose-driven groups serving alongside one another.",
    icon: Sparkles,
    color: "var(--pillar-spiritual)",
  },
  financial: {
    label: "Financial well-being",
    blurb: "Budget coaching, job readiness, tax help and small-business support.",
    icon: PiggyBank,
    color: "var(--pillar-financial)",
  },
};

export const ORG_TYPES = ["nonprofit", "faith_based", "small_business", "community_group"] as const;
export type OrgType = (typeof ORG_TYPES)[number];
export const ORG_TYPE_LABEL: Record<OrgType, string> = {
  nonprofit: "Nonprofit",
  faith_based: "Church or faith-based",
  small_business: "Small business",
  community_group: "Community group",
};

export const RESOURCE_CATEGORIES = [
  "food",
  "clothing",
  "furniture",
  "household",
  "school_supplies",
  "hygiene",
  "transportation",
  "volunteer_labor",
  "professional_services",
  "equipment",
  "event_supplies",
  "other",
] as const;
export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];
export const RESOURCE_CATEGORY_LABEL: Record<ResourceCategory, string> = {
  food: "Food",
  clothing: "Clothing",
  furniture: "Furniture",
  household: "Household supplies",
  school_supplies: "School supplies",
  hygiene: "Hygiene products",
  transportation: "Transportation help",
  volunteer_labor: "Volunteer labor",
  professional_services: "Professional services",
  equipment: "Equipment",
  event_supplies: "Event supplies",
  other: "Other",
};

export const EVENT_TYPES = [
  "fundraiser",
  "food_drive",
  "outreach",
  "volunteer_gathering",
  "workshop",
  "charity_drive",
  "community_meal",
  "networking",
  "wellness",
  "other",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  fundraiser: "Fundraiser",
  food_drive: "Food drive",
  outreach: "Community outreach",
  volunteer_gathering: "Volunteer gathering",
  workshop: "Workshop",
  charity_drive: "Charity drive",
  community_meal: "Community meal",
  networking: "Networking",
  wellness: "Wellness",
  other: "Other",
};

export const VERIFICATION_LABEL = {
  unverified: "Not yet verified",
  identity_verified: "Verified organization",
  tax_exempt_verified: "Verified, tax-exempt status checked",
} as const;

export const IMPACT_METRIC_LABEL: Record<string, { label: string; unit: string }> = {
  organizations_registered: { label: "Approved organizations", unit: "" },
  active_volunteers_12mo: { label: "Volunteers with verified hours (12 mo)", unit: "" },
  volunteer_hours: { label: "Verified volunteer hours", unit: "hours" },
  resource_transfer_completed: { label: "Completed resource transfers", unit: "" },
  resource_quantity_redistributed: { label: "Resources redistributed", unit: "" },
  event_completed: { label: "Events completed", unit: "" },
  event_attendance: { label: "Checked-in event attendees", unit: "" },
  partnership_formed: { label: "Partnerships formed", unit: "" },
  people_served: { label: "People served", unit: "" },
};
