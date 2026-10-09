import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { siteUrl } from "@/lib/env";

const secret = () => process.env.UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export function unsubscribeToken(userId: string) {
  return createHmac("sha256", secret()).update(`unsub:${userId}`).digest("base64url").slice(0, 32);
}

export function verifyUnsubscribe(userId: string, token: string) {
  if (!secret() || !/^[0-9a-f-]{36}$/i.test(userId)) return false;
  const a = Buffer.from(unsubscribeToken(userId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function unsubscribeUrl(userId: string) {
  return `${siteUrl}/unsubscribe?u=${userId}&t=${unsubscribeToken(userId)}`;
}
