import type { MetadataRoute } from "next";
import { appEnv, siteUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  if (appEnv === "demo") return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/admin", "/inbox", "/settings", "/notifications", "/transfers", "/api/", "/auth/", "/search"] },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
