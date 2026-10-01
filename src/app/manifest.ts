import type { MetadataRoute } from "next";

// Lets phones install the site as an app (Add to Home Screen): name, icon, full screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Legacy League",
    short_name: "Legacy",
    description: "Our dynasty basketball league",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1c1917",
    theme_color: "#1c1917",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
