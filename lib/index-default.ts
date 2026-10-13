import type { IndexFile } from "./index-types";

// An untouched index is dated 1970 so it never beats a real saved copy.
export const NEVER = new Date(0).toISOString();

export function createDefaultIndex(): IndexFile {
  return {
    version: 1,
    updatedAt: NEVER,

    accounts: [],
    files: [],
    folders: [],

    settings: {
      routing: "priority",
      theme: "system",
      safeMode: false,
    },
  };
}
