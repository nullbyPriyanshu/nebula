import { PHASE_PRODUCTION_BUILD } from "next/constants";
import type { NextConfig } from "next";

// Production builds use their own folder, so running `pnpm build` (or the
// browser tests) never disturbs a `pnpm dev` that is running at the same time.
// With a static export that folder is the export itself: out/.
export default function config(phase: string): NextConfig {
  return {
    distDir: phase === PHASE_PRODUCTION_BUILD ? "out" : ".next",
    experimental: {
      // The dev server's on-disk cache kept restoring a stale stylesheet after
      // restarts. Without it a restart recompiles from source: a few seconds
      // slower, but always what is in the files.
      turbopackFileSystemCacheForDev: false,
    },
    turbopack: {
      rules: {
        "*.css": {
          loaders: ["@tailwindcss/turbopack"],
          as: "*.css",
        },
      },
    },
    output: "export",
    images: { unoptimized: true },
    trailingSlash: true,
  };
}
