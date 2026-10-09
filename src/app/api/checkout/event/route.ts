import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { createEventCheckout, PaymentError } from "@/lib/payments";
import { siteUrl } from "@/lib/env";

export async function GET(req: Request) {
  const reg = new URL(req.url).searchParams.get("registration") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(reg)) return new Response("Bad request", { status: 400 });
  const user = await getCurrentUser();
  if (!user || !user.email) return NextResponse.redirect(`${siteUrl}/login?next=/dashboard/volunteer`);
  try {
    return NextResponse.redirect(await createEventCheckout(reg, user.id, user.email), 303);
  } catch (e) {
    const msg = e instanceof PaymentError ? e.message : "Couldn't start checkout. Try again.";
    if (!(e instanceof PaymentError)) console.error("[checkout:event]", e);
    return NextResponse.redirect(`${siteUrl}/dashboard/volunteer?error=${encodeURIComponent(msg)}`, 303);
  }
}
