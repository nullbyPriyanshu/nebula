// When each file was last opened on this device. Never synced: opening a file
// should not rewrite the index in every account.
const KEY = "nebula-opened";
const KEEP = 200;

let cache: Record<string, string> | null = null;

function load(): Record<string, string> {
  if (cache) return cache;

  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string>;
  } catch {
    cache = {};
  }

  return cache;
}

export const openedAt = (id: string): string | undefined => load()[id];

export function markOpened(id: string, persist: boolean) {
  const entries = Object.entries({ ...load(), [id]: new Date().toISOString() })
    .sort((a, b) => b[1].localeCompare(a[1]))
    .slice(0, KEEP);

  cache = Object.fromEntries(entries);

  if (persist) {
    try {
      localStorage.setItem(KEY, JSON.stringify(cache));
    } catch {}
  }
}

export function forgetOpened() {
  cache = {};

  try {
    localStorage.removeItem(KEY);
  } catch {}
}
