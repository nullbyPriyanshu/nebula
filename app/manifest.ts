import type { MetadataRoute } from "next";

// Static export: the manifest is generated once at build time.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nebula",
    short_name: "Nebula",
    description: "Pool several Google Drive accounts into one storage space.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f2ee",
    theme_color: "#058bff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
