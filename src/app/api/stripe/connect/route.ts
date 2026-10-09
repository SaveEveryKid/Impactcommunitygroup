import { NextResponse } from "next/server";
import { getCurrentUser, getSupabase } from "@/lib/supabase/server";
import { connectOnboardingLink, PaymentError } from "@/lib/payments";
import { siteUrl } from "@/lib/env";

/** Starts (or resumes) Stripe Connect onboarding for an organization. Org admins only. */
export async function GET(req: Request) {
  const orgId = new URL(req.url).searchParams.get("org") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) return new Response("Bad request", { status: 400 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${siteUrl}/login?next=/dashboard/org/${orgId}/donations`);
  const supabase = (await getSupabase())!;
  const { data: isAdmin } = await supabase.rpc("has_org_role", { p_org: orgId, p_min: "admin" });
  if (!isAdmin) return new Response("Forbidden", { status: 403 });
  const { data: org } = await supabase.from("organizations").select("status, verification_level").eq("id", orgId).single();
  if (org?.status !== "approved" || org.verification_level === "unverified") {
    return NextResponse.redirect(`${siteUrl}/dashboard/org/${orgId}/donations?error=${encodeURIComponent("Your organization must be approved and verified before connecting payments.")}`);
  }
  try {
    return NextResponse.redirect(await connectOnboardingLink(orgId, user.email));
  } catch (e) {
    const msg = e instanceof PaymentError ? e.message : "Couldn't reach the payment provider. Try again.";
    if (!(e instanceof PaymentError)) console.error("[connect]", e);
    return NextResponse.redirect(`${siteUrl}/dashboard/org/${orgId}/donations?error=${encodeURIComponent(msg)}`);
  }
}
