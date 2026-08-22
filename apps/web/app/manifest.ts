import type { MetadataRoute } from "next";
import { translate } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

// Next serves this at /manifest.webmanifest and injects <link rel="manifest">.
// It is a single static document, so it speaks the default locale rather than
// the per-request cookie one (getT would make the route dynamic).

export default function manifest(): MetadataRoute.Manifest {
  const t = (key: Parameters<typeof translate>[1]) =>
    translate(DEFAULT_LOCALE, key);

  return {
    id: "/",
    name: "Superteam Certify",
    short_name: "Certify",
    description: t("meta.description"),
    lang: DEFAULT_LOCALE,
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // theme/background match the light canvas so the install splash and the
    // app's own first paint are the same cream (globals.css --background).
    background_color: "#f5e8ca",
    theme_color: "#f5e8ca",
    categories: ["education", "productivity"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // Padded so the mark survives Android's adaptive-icon crop.
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: t("footer.verifyCertificate"),
        url: "/verify",
      },
      {
        name: t("footer.myDocuments"),
        url: "/me",
      },
    ],
  };
}
