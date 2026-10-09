import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Database functions raise human-readable messages with specific SQLSTATEs.
 * Pass those through; hide anything unexpected behind a generic message and
 * log the detail server-side (never silently swallow).
 */
const USER_FACING_CODES = new Set(["42501", "P0002", "22023", "23514", "23505", "P0001"]);

export function friendlyDbError(error: PostgrestError | null | undefined, fallback = "Something went wrong. Try again."): string | null {
  if (!error) return null;
  if (error.code && USER_FACING_CODES.has(error.code) && error.message && !/violates row-level security/.test(error.message)) {
    if (error.code === "23505" && /duplicate key/.test(error.message)) return "That already exists.";
    return error.message;
  }
  if (/row-level security/.test(error.message)) return "You don't have permission to do that.";
  console.error("[db]", error.code, error.message, error.details);
  return fallback;
}
