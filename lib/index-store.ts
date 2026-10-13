import { createDefaultIndex } from "./index-default";
import type { FileRecord, IndexFile, Location } from "./index-types";

// Accepts anything read from disk or Drive and returns a usable index, or null.
export function normalizeIndex(value: unknown): IndexFile | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const index = value as Partial<IndexFile>;

  if (
    index.version !== 1 ||
    typeof index.updatedAt !== "string" ||
    !Array.isArray(index.accounts) ||
    !Array.isArray(index.files) ||
    !Array.isArray(index.folders)
  ) {
    return null;
  }

  return {
    version: 1,
    updatedAt: index.updatedAt,
    accounts: index.accounts,
    files: index.files,
    folders: index.folders,
    settings: { ...createDefaultIndex().settings, ...index.settings },
  };
}

// Last writer wins: keep the copy with the newest updatedAt.
export function newest(
  ...copies: (IndexFile | null | undefined)[]
): IndexFile | null {
  let best: IndexFile | null = null;

  for (const copy of copies) {
    if (copy && (!best || copy.updatedAt > best.updatedAt)) {
      best = copy;
    }
  }

  return best;
}

const sharesAccount = (a: IndexFile, b: IndexFile) =>
  a.accounts.some((x) => b.accounts.some((y) => y.email === x.email));

function union(primary: IndexFile, other: IndexFile): IndexFile {
  const fileIds = new Set(primary.files.map((file) => file.id));
  const emails = new Set(primary.accounts.map((account) => account.email));
  const top = Math.max(0, ...primary.accounts.map((a) => a.priority));

  return {
    ...primary,
    files: [
      ...primary.files,
      ...other.files.filter((file) => !fileIds.has(file.id)),
    ],
    accounts: [
      ...primary.accounts,
      ...other.accounts
        .filter((account) => !emails.has(account.email))
        .map((account) => ({ ...account, priority: top + account.priority })),
    ],
    folders: [...new Set([...primary.folders, ...other.folders])],
  };
}

// Combines the index in memory with one just read from an account.
// Copies of the same index: the newest wins. Two indexes that never shared an
// account were built separately, so neither may overwrite the other: union them.
export function reconcile(
  current: IndexFile,
  incoming: IndexFile | null,
): IndexFile {
  if (!incoming) {
    return current;
  }

  const [primary, other] =
    incoming.updatedAt > current.updatedAt
      ? [incoming, current]
      : [current, incoming];

  const separate =
    current.accounts.length > 0 &&
    incoming.accounts.length > 0 &&
    !sharesAccount(current, incoming);

  return separate ? union(primary, other) : primary;
}

export const locationsOf = (file: FileRecord): Location[] => [
  ...(file.location ? [file.location] : []),
  ...(file.parts ?? []),
  ...(file.copies ?? []),
];
