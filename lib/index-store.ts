import { createDefaultIndex, NEVER } from "./index-default";
import type { AccountRecord, FileRecord, IndexFile, Location } from "./index-types";

// Deletion records older than this are dropped; a copy last seen before then
// could bring a deleted file back, which is the price of a bounded index.
const KEEP_DELETED_MS = 180 * 24 * 60 * 60 * 1000;

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
    settingsAt: index.settingsAt,
    foldersAt: index.foldersAt,
    deleted: index.deleted,
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

const later = (a = NEVER, b = NEVER) => (a > b ? a : b);

const fileStamp = (file: FileRecord) => file.updatedAt ?? file.uploadedAt;
const accountStamp = (account: AccountRecord) => account.updatedAt ?? account.lastUsed;

// Every record from both sides, the newer version of each, minus deleted ones.
function byKey<T>(
  primary: T[],
  other: T[],
  key: (item: T) => string,
  stamp: (item: T) => string,
  deleted: Record<string, string>,
  prefix: string,
): T[] {
  const chosen = new Map<string, T>();

  for (const item of [...primary, ...other]) {
    const existing = chosen.get(key(item));

    if (!existing || stamp(item) > stamp(existing)) {
      chosen.set(key(item), item);
    }
  }

  return [...chosen.values()].filter(
    (item) => (deleted[`${prefix}:${key(item)}`] ?? NEVER) < stamp(item),
  );
}

// Combines two copies record by record, so changes made on two devices both survive.
export function merge(a: IndexFile, b: IndexFile, now = Date.now()): IndexFile {
  const [primary, other] = a.updatedAt >= b.updatedAt ? [a, b] : [b, a];
  const cutoff = new Date(now - KEEP_DELETED_MS).toISOString();

  const deleted: Record<string, string> = {};

  for (const [key, at] of [
    ...Object.entries(other.deleted ?? {}),
    ...Object.entries(primary.deleted ?? {}),
  ]) {
    if (at > cutoff) deleted[key] = later(deleted[key], at);
  }

  const foldersAt: Record<string, string> = { ...other.foldersAt };

  for (const [path, at] of Object.entries(primary.foldersAt ?? {})) {
    foldersAt[path] = later(foldersAt[path], at);
  }

  // Accounts only the other copy knows go after this copy's, keeping priorities distinct.
  const top = Math.max(0, ...primary.accounts.map((account) => account.priority));
  const known = new Set(primary.accounts.map((account) => account.email));
  const separate = !sharesAccount(primary, other);

  const accounts = byKey(
    primary.accounts,
    other.accounts.map((account) =>
      separate && !known.has(account.email)
        ? { ...account, priority: top + account.priority }
        : account,
    ),
    (account) => account.email,
    accountStamp,
    deleted,
    "account",
  );

  // A folder deleted on one side stays deleted unless it was created again later.
  const folders = [...new Set([...primary.folders, ...other.folders])].filter((path) => {
    const gone = deleted[`folder:${path}`];

    return !gone || gone < (foldersAt[path] ?? NEVER);
  });

  const settings =
    (other.settingsAt ?? NEVER) > (primary.settingsAt ?? NEVER) ? other : primary;

  return {
    ...primary,
    updatedAt: later(primary.updatedAt, other.updatedAt),
    accounts,
    files: byKey(primary.files, other.files, (file) => file.id, fileStamp, deleted, "file"),
    folders,
    settings: settings.settings,
    settingsAt: settings.settingsAt,
    foldersAt,
    deleted,
  };
}

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
// Both record deletions: merge record by record. Otherwise (an index written
// before deletions were recorded) copies of the same index: the newest wins, so
// deletes stay deleted; two indexes that never shared an account: union them.
export function reconcile(
  current: IndexFile,
  incoming: IndexFile | null,
): IndexFile {
  if (!incoming || incoming.updatedAt === NEVER) {
    return current;
  }

  if (current.updatedAt === NEVER) {
    return incoming;
  }

  if (current.deleted && incoming.deleted) {
    return merge(current, incoming);
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

// Stamps what changed between two versions of the index, so a later merge
// knows which copy of each record is newer and what was deleted.
export function stamp(previous: IndexFile, next: IndexFile, at: string): IndexFile {
  const deleted = { ...previous.deleted, ...next.deleted };
  const foldersAt = { ...previous.foldersAt, ...next.foldersAt };

  const before = new Map(previous.files.map((file) => [file.id, file]));
  const files = next.files.map((file) =>
    before.get(file.id) === file ? file : { ...file, updatedAt: at },
  );
  const nextIds = new Set(next.files.map((file) => file.id));

  for (const file of previous.files) {
    if (!nextIds.has(file.id)) deleted[`file:${file.id}`] = at;
  }

  const accountsBefore = new Map(previous.accounts.map((a) => [a.email, a]));
  const accounts = next.accounts.map((account) =>
    accountsBefore.get(account.email) === account ? account : { ...account, updatedAt: at },
  );
  const emails = new Set(next.accounts.map((account) => account.email));

  for (const account of previous.accounts) {
    if (!emails.has(account.email)) deleted[`account:${account.email}`] = at;
  }

  const foldersNow = new Set(next.folders);
  const foldersBefore = new Set(previous.folders);

  for (const path of next.folders) {
    if (!foldersBefore.has(path)) foldersAt[path] = at;
  }

  for (const path of previous.folders) {
    if (!foldersNow.has(path)) deleted[`folder:${path}`] = at;
  }

  return {
    ...next,
    updatedAt: at,
    files,
    accounts,
    foldersAt,
    deleted,
    settingsAt: previous.settings === next.settings ? next.settingsAt : at,
  };
}

export const locationsOf = (file: FileRecord): Location[] => [
  ...(file.location ? [file.location] : []),
  ...(file.parts ?? []),
  ...(file.copies ?? []),
];
