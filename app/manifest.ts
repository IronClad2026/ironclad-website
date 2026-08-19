import type { MetadataRoute } from "next";
import { loadDictionary } from "@/lib/i18n/loaders";
import { getRequestLocale } from "@/lib/i18n/request";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const locale = await getRequestLocale();
  const copy = await loadDictionary(locale, "public");

  return {
    id: "/",
    name: copy.metadata.manifestName,
    short_name: "IronClad",
    description: copy.metadata.manifestDescription,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#f97316",
    categories: ["games", "sports", "entertainment"],
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/maskable-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
