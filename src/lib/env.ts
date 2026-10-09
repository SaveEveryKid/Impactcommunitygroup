/**
 * Centralised environment access. Server-only secrets are read lazily and
 * never imported into client components.
 */
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const brandName = process.env.NEXT_PUBLIC_BRAND_NAME ?? "Kindred Commons";

export const appEnv: "production" | "demo" = process.env.NEXT_PUBLIC_APP_ENV === "demo" ? "demo" : "production";

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export function requireServerEnv(name: string): string {
  if (typeof window !== "undefined") {
    throw new Error(`Server env ${name} requested in the browser`);
  }
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required environment variable ${name}. See .env.example and docs/DEPLOYMENT.md.`);
  }
  return v;
}
