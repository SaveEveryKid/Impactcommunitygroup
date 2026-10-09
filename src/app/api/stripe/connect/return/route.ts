import { NextResponse } from "next/server";
import { getCurrentUser, getSupabase } from "@/lib/supabase/server";
import { refreshConnectAccount } from "@/lib/payments";
import { siteUrl } from "@/lib/env";

export async function GET(req: Request) {
  const orgId = new URL(req.url).searchParams.get("org") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) return new Response("Bad request", { status: 400 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${siteUrl}/login`);
  const supabase = (await getSupabase())!;
  const { data: isAdmin } = await supabase.rpc("has_org_role", { p_org: orgId, p_min: "admin" });
  if (isAdmin) await refreshConnectAccount(orgId).catch((e) => console.error("[connect return]", e));
  return NextResponse.redirect(`${siteUrl}/dashboard/org/${orgId}/donations?connected=1`);
}
