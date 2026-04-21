import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Disable client-side Router Cache so navigations always re-fetch the RSC
    // payload from the server. The server already caches aggressively via
    // `unstable_cache` + tag-based revalidation (see src/lib/cache-tags.ts),
    // so this does not hit the DB — it only ensures users don't see stale
    // RSC that the browser still had in memory after an admin invalidation.
    staleTimes: { dynamic: 0, static: 30 },
  },
  async redirects() {
    return [
      { source: '/predictions', destination: '/pickem', permanent: true },
      { source: '/predictions/:path*', destination: '/pickem/:path*', permanent: true },
    ];
  },
};

export default nextConfig;
