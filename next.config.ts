import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  env: {
    /**
     * Baked into the JavaScript at build time.
     *
     * The diagnostics page compares this against the value the server reports
     * at runtime. When they disagree, the browser is running a cached bundle
     * from an older deploy — which looks exactly like the app being broken,
     * and is the one cause no amount of server-side checking can detect.
     */
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
  },
};

export default nextConfig;
