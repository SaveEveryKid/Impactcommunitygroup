import { NextResponse } from "next/server";
import { getCurrentUser, getSupabase } from "@/lib/supabase/server";
import { connectDashboardLink } from "@/lib/payments";
import { siteUrl } from "@/lib/env";

export async function GET(req: Request) {
  const orgId = new URL(req.url).searchParams.get("org") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) return new Response("Bad request", { status: 400 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${siteUrl}/login`);
  const { data: isAdmin } = await (await getSupabase())!.rpc("has_org_role", { p_org: orgId, p_min: "admin" });
  if (!isAdmin) return new Response("Forbidden", { status: 403 });
  try {
    return NextResponse.redirect(await connectDashboardLink(orgId));
  } catch {
    return NextResponse.redirect(`${siteUrl}/dashboard/org/${orgId}/donations?error=${encodeURIComponent("Couldn't open the Stripe dashboard.")}`);
  }
}
