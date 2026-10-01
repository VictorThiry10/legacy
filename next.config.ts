import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Pages you just visited stay ready for 30 seconds, so going back to a tab is instant.
    staleTimes: { dynamic: 30 },
  },
};

export default nextConfig;
