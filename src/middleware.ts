import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/inbox", "/notifications", "/settings", "/admin", "/transfers"];

/**
 * Refreshes the Supabase session cookie on every request and redirects
 * signed-out users away from private areas. Authorization itself is enforced
 * by RLS and server-side checks — this is only a UX convenience.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });

  const isProtected = PROTECTED_PREFIXES.some((p) => request.nextUrl.pathname.startsWith(p));
  if (!url || !key) {
    if (isProtected) {
      const to = request.nextUrl.clone();
      to.pathname = "/login";
      to.searchParams.set("next", request.nextUrl.pathname);
      return NextResponse.redirect(to);
    }
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtected && !user) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = "";
    to.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  matcher: [
    // Skip static assets, images and webhook endpoints (which must receive raw bodies untouched).
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|robots.txt|sitemap.xml|api/stripe/webhook|.*\\.(?:svg|png|jpg|jpeg|webp|avif)$).*)",
  ],
};
