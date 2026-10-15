import { normalizePath } from "./folders";

export type Entry = { file: File; folder: string };

// FileSystemDirectoryReader hands out entries in batches until it returns none.
function readAll(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];

    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) return resolve(all);

        all.push(...batch);
        next();
      }, reject);

    next();
  });
}

async function walk(entry: FileSystemEntry, folder: string, out: Entry[]) {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );

    out.push({ file, folder });
  } else if (entry.isDirectory) {
    const children = await readAll((entry as FileSystemDirectoryEntry).createReader());

    for (const child of children) {
      await walk(child, normalizePath(`${folder}/${entry.name}`), out);
    }
  }
}

// Dropped files and folders, keeping each folder's structure under `base`.
// Entries must be taken synchronously, while the drop event is still live.
export async function entriesFromDrop(data: DataTransfer, base: string): Promise<Entry[]> {
  const entries = [...data.items]
    .filter((item) => item.kind === "file")
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => Boolean(entry));

  if (entries.length === 0) {
    return [...data.files].map((file) => ({ file, folder: base }));
  }

  const out: Entry[] = [];

  for (const entry of entries) {
    await walk(entry, base, out);
  }

  return out;
}

// Files from <input webkitdirectory>, placed by their relative path.
export const entriesFromPicker = (files: FileList, base: string): Entry[] =>
  [...files].map((file) => {
    const relative = file.webkitRelativePath || file.name;
    const dir = relative.slice(0, relative.lastIndexOf("/") + 1);

    return { file, folder: normalizePath(`${base}/${dir}`) };
  });
