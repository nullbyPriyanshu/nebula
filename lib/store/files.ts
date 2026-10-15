// Trash, delete, rename, move, share, star and folders.
import { allFolders, folderName, isInside, joinPath, normalizePath, parentOf, ROOT } from "../folders";
import { locationsOf } from "../index-store";
import type { FileRecord, IndexFile } from "../index-types";
import { partName } from "../split";
import { adapterFor } from "../storage/adapter";
import { deleteThumb } from "../thumbs";
import { refreshQuota } from "./accounts";
import {
  commit,
  connectedEmails,
  describeFiles,
  fileById,
  inBulk,
  notify,
  notifyUndo,
  plural,
  report,
  state,
  updateFile,
  updateFiles,
  whileBusy,
} from "./core";

// Trashed files are deleted for good after this many days.
export const TRASH_DAYS = 30;

const DAY = 24 * 60 * 60 * 1000;

export const liveIn = (folder: string) =>
  state.index.files.filter((file) => !file.trashedAt && file.folder === folder);

// "notes.txt" -> "notes (2).txt" when the folder already has a "notes.txt".
export function uniqueName(name: string, folder: string, except?: string, alsoTaken: string[] = []) {
  const taken = new Set(
    [
      ...liveIn(folder)
        .filter((file) => file.id !== except)
        .map((file) => file.name),
      ...alsoTaken,
    ].map((n) => n.toLowerCase()),
  );

  if (!taken.has(name.toLowerCase())) {
    return name;
  }

  const dot = name.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];

  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`;

    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

// ---------------------------------------------------------------- trash

async function setTrashedEverywhere(file: FileRecord, trashed: boolean) {
  for (const location of locationsOf(file)) {
    await adapterFor(location.account).setTrashed(location.fileId, trashed);
  }
}

// quiet: no message, for steps of a larger action that has its own.
export async function trashFiles(ids: string[], quiet = false) {
  const done: string[] = [];

  await inBulk("Moving to trash", ids, (id) =>
    whileBusy(id, async () => {
      const file = fileById(id);

      if (file && !file.trashedAt) {
        await setTrashedEverywhere(file, true);
        done.push(id);
      }
    }),
  );

  if (done.length > 0) {
    await updateFiles(done, { trashedAt: new Date().toISOString() });

    if (!quiet) {
      notifyUndo(`${describeFiles(done)} moved to the trash.`, () => restoreFiles(done));
    }
  }

  return done;
}

export const trashFile = (id: string) => trashFiles([id]);

export async function restoreFiles(ids: string[], quiet = false) {
  const done: string[] = [];

  await inBulk("Restoring", ids, (id) =>
    whileBusy(id, async () => {
      const file = fileById(id);

      if (file?.trashedAt) {
        await setTrashedEverywhere(file, false);
        done.push(id);
      }
    }),
  );

  if (done.length > 0) {
    await updateFiles(done, { trashedAt: undefined });

    if (!quiet) notify("success", `${describeFiles(done)} restored.`);
  }
}

export const restoreFile = (id: string) => restoreFiles([id]);

// Deletes each file, every split part and every safe-mode copy.
export async function deleteForeverMany(ids: string[], quiet = false) {
  const gone: string[] = [];
  const names = describeFiles(ids);

  await inBulk("Deleting for good", ids, (id) =>
    whileBusy(id, async () => {
      const file = fileById(id);

      if (!file) return;

      for (const location of locationsOf(file)) {
        await adapterFor(location.account).remove(location.fileId);
      }

      gone.push(id);
      void deleteThumb(id);
    }),
  );

  if (gone.length === 0) {
    return;
  }

  await commit({
    ...state.index,
    files: state.index.files.filter((file) => !gone.includes(file.id)),
  });
  void refreshQuota();

  if (!quiet) {
    notify("success", `${gone.length === ids.length ? names : plural(gone.length, "file")} deleted for good.`);
  }
}

export const deleteForever = (id: string) => deleteForeverMany([id]);

export const emptyTrash = () =>
  deleteForeverMany(
    state.index.files.filter((file) => file.trashedAt).map((file) => file.id),
  );

// Days left before a trashed file is purged.
export const daysLeft = (file: FileRecord, now = Date.now()) =>
  file.trashedAt
    ? Math.max(0, Math.ceil(TRASH_DAYS - (now - Date.parse(file.trashedAt)) / DAY))
    : TRASH_DAYS;

// Deletes trash older than TRASH_DAYS, when every account holding it is connected.
export async function purgeOldTrash(now = Date.now()) {
  const connected = new Set(connectedEmails());

  const old = state.index.files.filter(
    (file) =>
      file.trashedAt &&
      daysLeft(file, now) === 0 &&
      locationsOf(file).every((location) => connected.has(location.account)),
  );

  if (old.length > 0) {
    await deleteForeverMany(old.map((file) => file.id), true);
    notify(
      "info",
      `Deleted ${plural(old.length, "file")} that had been in the trash over ${TRASH_DAYS} days.`,
    );
  }
}

// ---------------------------------------------------------------- rename and move

// Keeps the names in Google Drive in step. Encrypted files keep their neutral name.
async function renameInDrive(file: FileRecord, name: string) {
  if (file.encrypted) return;

  try {
    if (file.location) await adapterFor(file.location.account).rename(file.location.fileId, name);

    for (const copy of file.copies ?? []) {
      await adapterFor(copy.account).rename(copy.fileId, name);
    }

    const parts = [...(file.parts ?? [])].sort((a, b) => a.offset - b.offset);

    for (const [i, part] of parts.entries()) {
      await adapterFor(part.account).rename(part.fileId, partName(name, i + 1, parts.length));
    }
  } catch (error) {
    report(error, "Renamed in Nebula, but not in Google Drive: ");
  }
}

export async function renameFile(id: string, name: string, quiet = false) {
  const file = fileById(id);
  const clean = name.replaceAll("/", " ").trim();

  if (!file || !clean || clean === file.name) {
    return;
  }

  if (uniqueName(clean, file.folder, id) !== clean) {
    notify("error", `This folder already has a file named "${clean}".`);

    return;
  }

  const old = file.name;
  // Confirm at once; saving to the accounts carries on in the background.
  const saved = updateFile(id, { name: clean });

  if (!quiet) {
    notifyUndo(`Renamed to "${clean}".`, () => renameFile(id, old, true));
  }

  void renameInDrive(file, clean);
  await saved;
}

// Moving only edits the path in the index; no bytes move between accounts.
// `places` moves each file to its own folder (used by undo).
function relocate(places: Map<string, { folder: string; name?: string }>) {
  const renamed = new Map<string, string>();
  const oldNames = new Map([...places.keys()].map((id) => [id, fileById(id)!.name]));

  for (const [id, place] of places) {
    const file = fileById(id)!;

    renamed.set(
      id,
      place.name ?? uniqueName(file.name, place.folder, id, [...renamed.entries()]
        .filter(([other]) => places.get(other)!.folder === place.folder)
        .map(([, n]) => n)),
    );
  }

  void commit({
    ...state.index,
    files: state.index.files.map((file) =>
      places.has(file.id)
        ? { ...file, folder: places.get(file.id)!.folder, name: renamed.get(file.id)! }
        : file,
    ),
  });

  for (const [id, name] of renamed) {
    const file = fileById(id);

    if (file && name !== oldNames.get(id)) void renameInDrive(file, name);
  }
}

export function moveFiles(ids: string[], folder: string, quiet = false) {
  const target = normalizePath(folder);
  const moving = ids
    .map((id) => fileById(id))
    .filter((file): file is FileRecord => Boolean(file) && file!.folder !== target);

  if (moving.length === 0) {
    return;
  }

  const before = new Map(moving.map((file) => [file.id, { folder: file.folder, name: file.name }]));

  relocate(new Map(moving.map((file) => [file.id, { folder: target }])));

  if (!quiet) {
    notifyUndo(
      `${describeFiles(moving.map((f) => f.id))} moved to ${target === ROOT ? "My files" : folderName(target)}.`,
      () => relocate(before),
    );
  }
}

export const moveFile = (id: string, folder: string) => moveFiles([id], folder);

// ---------------------------------------------------------------- stars

export function setStarred(ids: string[], starred: boolean) {
  void updateFiles(ids, { starred: starred || undefined });
}

// ---------------------------------------------------------------- sharing

// Anyone with the link can view. Split and encrypted files have no single
// readable Drive file to share. `days` sets an expiry Nebula enforces itself
// (0: none); left out, an existing link keeps its expiry.
export async function shareFile(id: string, days?: number): Promise<string | null> {
  const file = fileById(id);

  if (!file?.location || file.encrypted) {
    notify(
      "error",
      file?.encrypted
        ? "Encrypted files cannot be shared by link: Google only holds scrambled bytes."
        : "Files split across accounts cannot be shared by link.",
    );

    return null;
  }

  const link = driveLink(file)!;
  const shareExpires = days ? new Date(Date.now() + days * DAY).toISOString() : undefined;

  if (file.shareId) {
    if (days !== undefined && shareExpires !== file.shareExpires) {
      await updateFile(id, { shareExpires });
    }

    return link;
  }

  try {
    const shareId = await adapterFor(file.location.account).share(file.location.fileId);

    await updateFile(id, { shareId, shareExpires });

    return link;
  } catch (error) {
    report(error, "Could not share: ");

    return null;
  }
}

export async function unshareFile(id: string, quiet = false) {
  const file = fileById(id);

  if (!file?.location || !file.shareId) {
    return;
  }

  try {
    await adapterFor(file.location.account).unshare(file.location.fileId, file.shareId);
    await updateFile(id, { shareId: undefined, shareExpires: undefined });

    if (!quiet) notify("success", `"${file.name}" is no longer shared.`);
  } catch (error) {
    report(error, "Could not stop sharing: ");
  }
}

// Google cannot expire "anyone" links, so Nebula revokes them at its next run.
export async function revokeExpiredShares(now = Date.now()) {
  const connected = new Set(connectedEmails());
  const expired = state.index.files.filter(
    (file) =>
      file.shareId &&
      file.shareExpires &&
      Date.parse(file.shareExpires) <= now &&
      file.location &&
      connected.has(file.location.account),
  );

  for (const file of expired) {
    await unshareFile(file.id, true);
  }

  if (expired.length > 0) {
    notify("info", `Stopped sharing ${plural(expired.length, "file")} whose link had expired.`);
  }
}

// The main copy in Google Drive, opened as that account. None for encrypted files.
export function driveLink(file: FileRecord): string | null {
  if (!file.location || file.encrypted) {
    return null;
  }

  const { account, fileId } = file.location;

  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view?authuser=${encodeURIComponent(account)}`;
}

// ---------------------------------------------------------------- folders

export function createFolder(parent: string, name: string): string | null {
  if (!name.trim()) {
    return null;
  }

  const path = joinPath(parent, name);

  if (path === ROOT) {
    return null;
  }

  if (foldersOf(state.index).includes(path)) {
    notify("error", `"${folderName(path)}" already exists here.`);

    return null;
  }

  void commit({ ...state.index, folders: [...state.index.folders, path] });
  notify("success", `Folder "${folderName(path)}" created.`);

  return path;
}

// Live files anywhere inside the folder.
export const filesInside = (path: string, index = state.index) =>
  index.files.filter((file) => !file.trashedAt && isInside(file.folder, path));

// Without contents, only an empty folder is deleted. With contents, its files go to the trash.
export async function deleteFolder(path: string, withContents = false) {
  const inside = filesInside(path);

  if (inside.length > 0 && !withContents) {
    notify("error", "Only empty folders can be deleted. Move or delete its files first.");

    return;
  }

  const removed = foldersOf(state.index).filter((folder) => isInside(folder, path));
  const trashed = inside.length > 0 ? await trashFiles(inside.map((file) => file.id), true) : [];

  // Something could not be trashed: keep the folder.
  if (filesInside(path).length > 0) return;

  await commit({
    ...state.index,
    folders: state.index.folders.filter((folder) => !isInside(folder, path)),
  });

  notifyUndo(
    trashed.length > 0
      ? `Folder "${folderName(path)}" and ${plural(trashed.length, "file")} moved to the trash.`
      : `Folder "${folderName(path)}" deleted.`,
    async () => {
      await commit({ ...state.index, folders: [...new Set([...state.index.folders, ...removed])] });

      if (trashed.length > 0) await restoreFiles(trashed, true);
    },
  );
}

export function renameFolder(path: string, name: string, quiet = false) {
  const target = joinPath(parentOf(path), name);

  if (target === path || target === ROOT) {
    return;
  }

  if (foldersOf(state.index).includes(target)) {
    notify("error", `"${folderName(target)}" already exists here.`);

    return;
  }

  const move = (p: string) => (isInside(p, path) ? target + p.slice(path.length) : p);

  void commit({
    ...state.index,
    folders: foldersOf(state.index).map(move),
    files: state.index.files.map((file) =>
      isInside(file.folder, path) ? { ...file, folder: move(file.folder) } : file,
    ),
  });

  if (!quiet) {
    notifyUndo(`Renamed to "${folderName(target)}".`, () => renameFolder(target, folderName(path), true));
  }
}

// Folders created by the student plus those holding live files. A trashed
// file's folder comes back when the file is restored.
export const foldersOf = (index: IndexFile) =>
  allFolders([
    ...index.folders,
    ...index.files.filter((file) => !file.trashedAt).map((file) => file.folder),
  ]);
