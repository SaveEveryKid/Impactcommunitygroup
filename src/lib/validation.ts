import { z } from "zod";
import { EVENT_TYPES, ORG_TYPES, PILLARS, RESOURCE_CATEGORIES } from "@/lib/constants";

export type ActionState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Collect string values (for re-populating forms after an error; never includes passwords). */
export function echoValues(fd: FormData, omit: string[] = ["password", "confirm_password"]) {
  const v: Record<string, string> = {};
  for (const [k, val] of fd.entries()) if (typeof val === "string" && !omit.includes(k)) v[k] = val;
  return v;
}

const trimmed = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`);
const optionalText = (max: number) =>
  trimmed(max)
    .optional()
    .transform((v) => (v ? v : null));

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128, "Use 128 characters or fewer")
  .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), "Include at least one letter and one number");

export const signUpSchema = z
  .object({
    display_name: trimmed(80).min(1, "Enter your name"),
    email: z.string().trim().toLowerCase().email("Enter a valid email address"),
    password: passwordSchema,
    age_confirmation: z.enum(["adult", "minor"], { message: "Tell us whether you are 18 or older" }),
    accept_terms: z.literal("on", { message: "You must accept the terms and community guidelines" }),
    account_type: z.enum(["individual", "organization"]).default("individual"),
  });

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export const emailOnlySchema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address") });

export const newPasswordSchema = z
  .object({ password: passwordSchema, confirm_password: z.string() })
  .refine((d) => d.password === d.confirm_password, { message: "Passwords don't match", path: ["confirm_password"] });

const urlOrEmpty = z
  .string()
  .trim()
  .max(300)
  .optional()
  .transform((v) => (v ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : null))
  .refine((v) => v === null || /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(v), "Enter a valid website address");

export const organizationSchema = z.object({
  name: trimmed(140).min(2, "Enter the organization's name"),
  org_type: z.enum(ORG_TYPES, { message: "Choose an organization type" }),
  mission: trimmed(500).min(10, "Describe your mission in a sentence or two"),
  description: optionalText(5000),
  pillars: z.array(z.enum(PILLARS)).min(1, "Choose at least one well-being area"),
  service_categories: z.array(trimmed(40)).max(12).default([]),
  service_area: optionalText(200),
  city: trimmed(100).min(2, "Enter your city"),
  region: trimmed(100).min(2, "Enter your state"),
  postal_code: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => v || null),
  public_email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || z.string().email().safeParse(v).success, "Enter a valid email or leave blank"),
  public_phone: optionalText(40),
  website_url: urlOrEmpty,
  ein: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || /^\d{2}-?\d{7}$/.test(v), "EIN format is 12-3456789"),
});

export const resourceSchema = z
  .object({
    kind: z.enum(["offer", "need"]),
    title: trimmed(140).min(3, "Give the listing a short title"),
    description: optionalText(4000),
    category: z.enum(RESOURCE_CATEGORIES, { message: "Choose a category" }),
    quantity_total: z.coerce.number().positive("Quantity must be more than zero").max(1_000_000),
    unit: trimmed(30).min(1, "Enter a unit, like lbs, boxes or hours"),
    general_location: optionalText(120),
    fulfillment: z.enum(["pickup", "delivery", "either"]),
    is_perishable: z.boolean(),
    expires_at: z
      .string()
      .optional()
      .transform((v) => (v ? new Date(v).toISOString() : null)),
    handling_requirements: optionalText(1000),
    special_instructions: optionalText(1000),
    pickup_address: optionalText(300),
    contact_name: optionalText(100),
    contact_phone: optionalText(40),
    publish: z.boolean(),
  })
  .refine((d) => !d.is_perishable || d.expires_at, { message: "Perishable items need a use-by date", path: ["expires_at"] });

export const opportunitySchema = z.object({
  title: trimmed(140).min(3, "Give the opportunity a title"),
  summary: optionalText(300),
  description: optionalText(5000),
  skills_required: z.array(trimmed(40)).max(15).default([]),
  general_location: optionalText(120),
  is_virtual: z.boolean(),
  starts_at: z.string().optional().transform((v) => (v ? new Date(v).toISOString() : null)),
  ends_at: z.string().optional().transform((v) => (v ? new Date(v).toISOString() : null)),
  capacity: z.coerce.number().int().positive().max(10000).optional().nullable(),
  requires_approval: z.boolean(),
  allows_minors: z.boolean(),
  min_age: z.coerce.number().int().min(0).max(99).optional().nullable(),
  pillars: z.array(z.enum(PILLARS)).default([]),
  publish: z.boolean(),
});

export const eventSchema = z
  .object({
    title: trimmed(140).min(3, "Give the event a title"),
    summary: optionalText(300),
    description: optionalText(8000),
    event_type: z.enum(EVENT_TYPES),
    starts_at: z.string().min(1, "Choose a start time"),
    ends_at: z.string().min(1, "Choose an end time"),
    timezone: z.string().default("America/Chicago"),
    is_virtual: z.boolean(),
    venue_name: optionalText(140),
    venue_address: optionalText(300),
    general_location: optionalText(120),
    virtual_url: z
      .string()
      .trim()
      .optional()
      .transform((v) => v || null)
      .refine((v) => v === null || /^https:\/\//.test(v), "Virtual links must start with https://"),
    visibility: z.enum(["public", "unlisted", "private"]),
    capacity: z.coerce.number().int().positive().max(100000).optional().nullable(),
    price_dollars: z.coerce.number().min(0).max(10000).default(0),
    pillars: z.array(z.enum(PILLARS)).default([]),
    publish: z.boolean(),
  })
  .refine((d) => new Date(d.ends_at) > new Date(d.starts_at), { message: "End time must be after the start", path: ["ends_at"] });

export const contactSchema = z.object({
  name: trimmed(120).min(1, "Enter your name"),
  email: z.string().trim().email("Enter a valid email address"),
  topic: z.enum(["general", "organization", "volunteer", "sponsor", "press", "safety"]),
  message: trimmed(4000).min(10, "Tell us a little more"),
  website: z.string().max(0).optional(), // honeypot
});
