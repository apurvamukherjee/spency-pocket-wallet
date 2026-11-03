import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Inlined at build time so the browser can reach Supabase. Accepts the NEXT_PUBLIC_ names or the plain
  // SUPABASE_* names (Vercel warns about NEXT_PUBLIC_ variables containing "KEY", though this key is public by design).
  env: {
    SPENCY_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "",
    SPENCY_SUPABASE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "",
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
