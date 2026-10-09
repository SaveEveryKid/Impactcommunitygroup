import type { Metadata, Viewport } from "next";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource/atkinson-hyperlegible/latin-400.css";
import "@fontsource/atkinson-hyperlegible/latin-700.css";
import "@fontsource/atkinson-hyperlegible/latin-400-italic.css";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { EnvironmentBanner, AnnouncementBar } from "@/components/banners";
import { appEnv, brandName, siteUrl } from "@/lib/env";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${brandName}: community well-being network`, template: `%s | ${brandName}` },
  description:
    "A community collaboration network connecting nonprofits, churches, small businesses and volunteers to share resources, coordinate events and meet real needs.",
  applicationName: brandName,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: brandName,
    url: siteUrl,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: brandName }],
  },
  twitter: { card: "summary_large_image" },
  robots: appEnv === "demo" ? { index: false, follow: false } : undefined,
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: brandName, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#13233a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <EnvironmentBanner />
        <AnnouncementBar />
        <SiteHeader />
        <main id="main" tabIndex={-1} className="outline-none">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
