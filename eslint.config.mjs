import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "node_modules/**"]),
  {
    rules: {
      // Cover art comes from whichever public provider instance responded, so
      // the host set is not knowable at build time and next/image's
      // remotePatterns cannot cover it. See components/ui/Artwork.tsx.
      "@next/next/no-img-element": "off",
    },
  },
]);
