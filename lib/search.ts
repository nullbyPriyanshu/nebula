import type { FileRecord } from "./index-types";

const HISTORY_KEY = "nebula-searches";
const HISTORY_SIZE = 8;

// Lower case without accents, so "resume" finds "Résumé".
export const fold = (text: string) =>
  text.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase();

// Every word must appear in the file's name or folder path, in any order.
export function matches(file: FileRecord, query: string) {
  const words = fold(query).split(/\s+/).filter(Boolean);

  if (words.length === 0) return true;

  const haystack = fold(`${file.folder}/${file.name}`);

  return words.every((word) => haystack.includes(word));
}

// Recent searches live only in this browser.
export function searchHistory(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");

    return Array.isArray(saved) ? saved.filter((q) => typeof q === "string") : [];
  } catch {
    return [];
  }
}

export function rememberSearch(query: string) {
  const clean = query.trim();

  if (clean.length < 2) return;

  try {
    const next = [clean, ...searchHistory().filter((q) => q !== clean)].slice(0, HISTORY_SIZE);

    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: no history.
  }
}

export function forgetSearches() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {}
}
