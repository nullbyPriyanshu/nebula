// Downloads and previews: fetched, hash-checked, decrypted when needed.
import { decryptBlob, Decryptor } from "../crypto";
import { AuthExpiredError, IntegrityError } from "../errors";
import { formatBytes } from "../format";
import { createHasher, sha256 } from "../hash";
import type { FileRecord, Location } from "../index-types";
import { adapterFor } from "../storage/adapter";
import { markOpened } from "../recent";
import { makeThumb, saveThumb } from "../thumbs";
import {
  ask,
  fileById,
  isAbort,
  notify,
  set,
  setRuntime,
  state,
  whenIdle,
  whileBusy,
} from "./core";
import { requireKey } from "./vault";

// Above this, browsers that cannot stream to disk are warned before downloading.
const MEMORY_WARNING = 1024 ** 3;

// What is actually stored: the ciphertext for an encrypted file.
const storedHash = (file: FileRecord) => (file.encrypted ? file.cipher!.sha256 : file.sha256);
const storedSize = (file: FileRecord) => (file.encrypted ? file.cipher!.size : file.size);

function showProgress(file: FileRecord, bytes: number) {
  const size = storedSize(file);

  set({
    progress: {
      ...state.progress,
      [file.id]: size ? Math.min(0.99, bytes / size) : 0.99,
    },
  });
}

// A stored piece; split parts carry their own hash.
type Piece = Location & { sha256?: string };

// The stored bytes, in order: every part, or the main copy then any safe-mode copy.
const sources = (file: FileRecord): Piece[][] =>
  file.parts
    ? [[...file.parts].sort((a, b) => a.offset - b.offset)]
    : [file.location, ...(file.copies ?? [])].filter((l): l is Location => Boolean(l)).map((l) => [l]);

function noteFailure(error: unknown) {
  if (error instanceof AuthExpiredError) {
    setRuntime(error.email, { connected: false });
  }
}

// ---------------------------------------------------------------- in memory

async function fetchChecked(
  location: Location,
  hash: string,
  name: string,
  onBytes: (n: number) => void,
  signal?: AbortSignal,
) {
  const blob = await adapterFor(location.account).download(location.fileId, onBytes, signal);

  if ((await sha256(blob)) !== hash) {
    throw new IntegrityError(name);
  }

  return blob;
}

// The stored bytes, refused unless every hash matches.
async function fetchStored(file: FileRecord, signal?: AbortSignal): Promise<Blob> {
  let failure: unknown = new Error(`"${file.name}" has no stored location.`);

  for (const pieces of sources(file)) {
    try {
      const blobs: Blob[] = [];
      let before = 0;

      for (const piece of pieces) {
        const hash = piece.sha256 ?? storedHash(file);

        blobs.push(
          await fetchChecked(piece, hash, file.name, (n) => showProgress(file, before + n), signal),
        );
        before += blobs.at(-1)!.size;
      }

      const whole = new Blob(blobs);

      if (pieces.length > 1 && (await sha256(whole)) !== storedHash(file)) {
        throw new IntegrityError(file.name);
      }

      return whole;
    } catch (error) {
      if (isAbort(error)) throw error;

      noteFailure(error);
      failure = error;
    }
  }

  throw failure;
}

async function fetchPlain(file: FileRecord, signal?: AbortSignal): Promise<Blob> {
  // Ask for the passphrase before spending time on the download.
  const key = file.encrypted ? await requireKey() : null;
  const stored = await fetchStored(file, signal);

  set({ progress: { ...state.progress, [file.id]: 1 } });

  return key
    ? decryptBlob(key, file.cipher!, file.size, stored, file.type)
    : new Blob([stored], { type: file.type });
}

// Downloads and previews in flight, by file id.
const transfers = new Map<string, AbortController>();

export function cancelTransfer(id: string) {
  transfers.get(id)?.abort();
}

export function abortTransfers() {
  transfers.forEach((controller) => controller.abort());
}

async function track<T>(file: FileRecord, work: (signal: AbortSignal) => Promise<T>) {
  // A transfer of this file that is just stopping (say, a closed preview) must
  // finish first, or this one would be refused as busy.
  if (transfers.get(file.id)?.signal.aborted) await whenIdle(file.id);

  let result: T | null = null;

  await whileBusy(file.id, async () => {
    const controller = new AbortController();

    transfers.set(file.id, controller);
    set({ progress: { ...state.progress, [file.id]: 0 } });

    try {
      result = await work(controller.signal);
    } finally {
      transfers.delete(file.id);
    }
  });

  return result as T | null;
}

async function thumbFrom(file: FileRecord, blob: Blob) {
  const thumb = await makeThumb(blob);

  if (thumb) await saveThumb(file.id, thumb, state.mode === "private");
}

// Fetches, checks and decrypts a file; resolves null when it failed or was cancelled.
export async function loadFile(id: string): Promise<Blob | null> {
  const file = fileById(id);

  if (!file) return null;

  const blob = await track(file, (signal) => fetchPlain(file, signal));

  if (blob) {
    markOpened(id, state.mode === "private");
    // A thumbnail for later, now that the bytes are here anyway.
    void thumbFrom(file, blob);
  }

  return blob;
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---------------------------------------------------------------- to disk

// Streams the file into `handle`, checking every hash on the way. The file on
// disk only changes once everything checked out; otherwise it is discarded.
async function streamTo(file: FileRecord, handle: FileSystemFileHandle, signal: AbortSignal) {
  const key = file.encrypted ? await requireKey() : null;
  let failure: unknown = new Error(`"${file.name}" has no stored location.`);

  for (const pieces of sources(file)) {
    const writable = await handle.createWritable();

    try {
      const whole = await createHasher();
      const decryptor = key ? new Decryptor(key, file.cipher!, file.size) : null;
      let received = 0;

      const write = async (bytes: Uint8Array) => {
        if (!decryptor) return writable.write(bytes as BufferSource);

        for (const plain of await decryptor.push(bytes)) {
          await writable.write(plain as BufferSource);
        }
      };

      for (const piece of pieces) {
        const own = pieces.length > 1 ? await createHasher() : null;
        const reader = (await adapterFor(piece.account).open(piece.fileId, signal)).getReader();

        for (;;) {
          const { done, value } = await reader.read();

          if (done) break;

          whole.update(value);
          own?.update(value);
          received += value.byteLength;
          showProgress(file, received);
          await write(value);
        }

        if (own && own.digest() !== piece.sha256) {
          throw new IntegrityError(file.name);
        }
      }

      if (whole.digest() !== storedHash(file)) {
        throw new IntegrityError(file.name);
      }

      for (const plain of (await decryptor?.finish()) ?? []) {
        await writable.write(plain as BufferSource);
      }

      await writable.close();

      return;
    } catch (error) {
      await writable.abort().catch(() => {});

      if (isAbort(error)) throw error;

      noteFailure(error);
      failure = error;
    }
  }

  throw failure;
}

const canStream = () => typeof window !== "undefined" && typeof window.showSaveFilePicker === "function";

async function downloadInMemory(file: FileRecord) {
  if (file.size > MEMORY_WARNING) {
    const ok = await ask({
      title: `Download "${file.name}"?`,
      body:
        `It is ${formatBytes(file.size)}. This browser has to hold the whole file in memory to check it, ` +
        "which can make the tab crash. Chrome and Edge save large files straight to disk instead.",
      confirm: "Download anyway",
    });

    if (!ok) return;
  }

  const blob = await track(file, (signal) => fetchPlain(file, signal));

  if (blob) saveBlob(blob, file.name);
}

// Call straight from a click: the save dialog needs one.
export async function downloadFile(id: string) {
  const file = fileById(id);

  if (!file) return;

  markOpened(id, state.mode === "private");

  if (!canStream()) {
    return downloadInMemory(file);
  }

  let handle: FileSystemFileHandle;

  try {
    handle = await window.showSaveFilePicker!({ suggestedName: file.name });
  } catch (error) {
    // The student closed the save dialog.
    if (isAbort(error)) return;

    throw error;
  }

  await track(file, (signal) => streamTo(file, handle, signal));
}

async function freeName(dir: FileSystemDirectoryHandle, name: string, taken: Set<string>) {
  const dot = name.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];

  for (let n = 1; ; n++) {
    const candidate = n === 1 ? name : `${stem} (${n})${ext}`;
    const exists = await dir.getFileHandle(candidate).then(() => true, () => false);

    if (!exists && !taken.has(candidate)) {
      taken.add(candidate);

      return candidate;
    }
  }
}

// Several files: into one chosen folder where possible, else one by one.
export async function downloadFiles(ids: string[]) {
  if (ids.length === 1) return downloadFile(ids[0]);

  if (typeof window !== "undefined" && typeof window.showDirectoryPicker === "function") {
    let dir: FileSystemDirectoryHandle;

    try {
      dir = await window.showDirectoryPicker({ mode: "readwrite" });
    } catch (error) {
      if (isAbort(error)) return;

      throw error;
    }

    const taken = new Set<string>();

    for (const id of ids) {
      const file = fileById(id);

      if (!file) continue;

      const handle = await dir.getFileHandle(await freeName(dir, file.name, taken), { create: true });

      await track(file, (signal) => streamTo(file, handle, signal));
    }

    notify("success", `Downloaded ${ids.length} files.`);

    return;
  }

  for (const id of ids) {
    const file = fileById(id);

    if (file) await downloadInMemory(file);
  }
}

// Google's own thumbnail for files it can read (not split, not encrypted).
// Links are short-lived, so they are kept for this session only.
const driveThumbs = new Map<string, Promise<string | null>>();

export function driveThumbnail(file: FileRecord): Promise<string | null> {
  if (!file.location || file.encrypted || !state.runtime[file.location.account]?.connected) {
    return Promise.resolve(null);
  }

  let link = driveThumbs.get(file.id);

  if (!link) {
    link = adapterFor(file.location.account)
      .thumbnail(file.location.fileId)
      .catch(() => null);
    driveThumbs.set(file.id, link);
  }

  return link;
}

// Exposed for moving files between accounts.
export { fetchStored };
