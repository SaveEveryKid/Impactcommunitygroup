import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireServerEnv, supabaseUrl } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS. Use ONLY in trusted server code paths
 * (Stripe webhooks, email delivery jobs, admin actions after an explicit
 * platform-admin check). Never import from a client component.
 */
export function getServiceClient() {
  return createClient(supabaseUrl, requireServerEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
