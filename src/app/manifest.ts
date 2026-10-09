import type { MetadataRoute } from "next";
import { brandName } from "@/lib/env";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brandName,
    short_name: brandName.split(" ")[0],
    description: "Community collaboration network for whole-person well-being.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#eef0ea",
    theme_color: "#13233a",
    orientation: "portrait-primary",
    categories: ["social", "lifestyle", "productivity"],
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
