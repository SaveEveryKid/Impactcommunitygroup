import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { getServiceClient } from "@/lib/supabase/admin";

export async function clientFingerprint(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(-16) ?? "salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/**
 * Returns true if the action is allowed. Fails CLOSED for abuse-prone
 * anonymous endpoints when the limiter can't be reached.
 */
export async function rateLimit(bucket: string, max: number, windowSeconds: number): Promise<boolean> {
  try {
    const key = `${bucket}:${await clientFingerprint()}`;
    const { data, error } = await getServiceClient().rpc("hit_rate_limit", { p_key: key, p_max: max, p_window_seconds: windowSeconds });
    if (error) throw error;
    return Boolean(data);
  } catch (e) {
    console.error("[rate-limit] unavailable", e);
    return false;
  }
}
