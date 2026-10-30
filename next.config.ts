import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Pages you just visited stay ready for 30 seconds; tabs prefetched in full stay ready for 60.
    staleTimes: { dynamic: 30, static: 60 },
  },
  // The home-screen app opens on "/": serve the Matchup page there directly, so the first tap on Matchup
  // reuses it instead of loading it again behind a skeleton.
  async rewrites() {
    return { beforeFiles: [{ source: "/", destination: "/matchup" }] };
  },
  // The usual safety headers: no framing by other sites, no content sniffing, no referrer leaks, no device access.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
