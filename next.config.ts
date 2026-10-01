import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Pages you just visited stay ready for 30 seconds; tabs prefetched in full stay ready for 60.
    staleTimes: { dynamic: 30, static: 60 },
  },
  // The home-screen app opens on "/": serve the Team page there directly, so the first tap on Team
  // reuses it instead of loading it again behind a skeleton.
  async rewrites() {
    return { beforeFiles: [{ source: "/", destination: "/team" }] };
  },
};

export default nextConfig;
