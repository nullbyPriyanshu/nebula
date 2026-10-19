import { PHASE_PRODUCTION_BUILD } from "next/constants";
import type { NextConfig } from "next";

// Production builds use their own folder, so running `pnpm build` (or the
// browser tests) never disturbs a `pnpm dev` that is running at the same time.
export default function config(phase: string): NextConfig {
  return {
    distDir: phase === PHASE_PRODUCTION_BUILD ? ".next-build" : ".next",
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
