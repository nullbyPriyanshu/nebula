// The upload queue: hashing, placement, encryption and parallel uploads.
import { encryptBlob } from "../crypto";
import { AuthExpiredError, QuotaExceededError, messageOf } from "../errors";
import { normalizePath } from "../folders";
import { formatBytes } from "../format";
import { sha256 } from "../hash";
import type { Cipher, Location, Part } from "../index-types";
import { partName, splitLayout } from "../split";
import { adapterFor } from "../storage/adapter";
import { plan } from "../storage/placement";
import { makeThumb, saveThumb } from "../thumbs";
import { accountStates, refreshQuota } from "./accounts";
import {
  ask,
  commit,
  connectedEmails,
  fileById,
  notify,
  report,
  set,
  setRuntime,
  state,
  subscribe,
  updateFile,
  type Interrupted,
  type UploadItem,
} from "./core";
import { liveIn, trashFiles, uniqueName } from "./files";
import { requireKey } from "./vault";

// Uploads running at once. Each goes to a different account when it can.
export const MAX_PARALLEL = 3;

const ACTIVE = ["waiting", "hashing", "uploading"];

// The File objects behind queue items; kept out of state so snapshots stay plain.
const pending = new Map<string, File>();

// Encrypted bytes per item, kept so a paused upload resumes the same session.
// Each may be a temporary file on disk, deleted with discard() when done.
const payloads = new Map<string, { blob: Blob; cipher: Cipher; discard: () => Promise<void> }>();

function patchItem(id: string, patch: Partial<UploadItem>) {
  set({
    queue: state.queue.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  });
}

const itemById = (id: string) => state.queue.find((item) => item.id === id);

function forget(id: string) {
  pending.delete(id);
  void payloads.get(id)?.discard();
  payloads.delete(id);
}

// ---------------------------------------------------------------- after a reload

const UNFINISHED_KEY = "nebula-interrupted-uploads";
const UNFINISHED = ["waiting", "hashing", "uploading", "paused", "failed"];

const sameFile = (a: Interrupted, file: File) =>
  a.name === file.name && a.size === file.size && a.lastModified === file.lastModified;

// Remembers what is still uploading, so a reload can offer to continue it.
// Written only when that list changes, and never in Public PC mode.
let lastSaved = "";

subscribe(() => {
  if (state.mode !== "private") return;

  const unfinished: Interrupted[] = [
    ...state.interrupted,
    ...state.queue
      .filter((item) => UNFINISHED.includes(item.status) && item.lastModified !== undefined)
      .map((item) => ({ name: item.name, size: item.size, lastModified: item.lastModified!, folder: item.folder })),
  ];
  const json = JSON.stringify(unfinished);

  if (json === lastSaved) return;

  lastSaved = json;

  try {
    if (unfinished.length > 0) localStorage.setItem(UNFINISHED_KEY, json);
    else localStorage.removeItem(UNFINISHED_KEY);
  } catch {}
});

// On start-up (private mode): uploads the last visit did not finish.
export function loadInterrupted() {
  try {
    const saved = JSON.parse(localStorage.getItem(UNFINISHED_KEY) ?? "[]") as Interrupted[];

    if (Array.isArray(saved) && saved.length > 0) set({ interrupted: saved });
  } catch {}
}

export function dismissInterrupted() {
  set({ interrupted: [] });
}

// Each entry lands in its own folder; used for folder uploads. A file that an
// earlier visit was uploading goes back to its original folder, and its
// upload continues where it stopped.
export function enqueueEntries(entries: { file: File; folder: string }[]) {
  let interrupted = state.interrupted;

  const items = entries.map(({ file, folder }): UploadItem => {
    const id = crypto.randomUUID();
    const earlier = interrupted.find((entry) => sameFile(entry, file));

    if (earlier) interrupted = interrupted.filter((entry) => entry !== earlier);

    pending.set(id, file);

    return {
      id,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      folder: normalizePath(earlier?.folder ?? folder),
      status: "waiting",
      progress: 0,
    };
  });

  set({ queue: [...state.queue, ...items], interrupted });
  runQueue();
}

export const enqueue = (files: File[], folder: string) =>
  enqueueEntries(files.map((file) => ({ file, folder })));

export function retryUpload(id: string) {
  patchItem(id, {
    status: "waiting",
    progress: 0,
    message: undefined,
    pausedBy: undefined,
    waitingFor: undefined,
  });
  runQueue();
}

// Upload a file that was skipped as a duplicate after all.
export function uploadAnyway(id: string) {
  patchItem(id, { force: true, duplicateOf: undefined });
  retryUpload(id);
}

// The uploads in flight and how to stop each.
const active = new Map<string, AbortController>();

export function cancelUpload(id: string) {
  const running = active.get(id);

  if (running) {
    running.abort("cancel");

    return;
  }

  forget(id);
  patchItem(id, { status: "cancelled", message: undefined, progress: 0 });
}

export function pauseUpload(id: string) {
  const running = active.get(id);

  if (running) {
    running.abort("pause");

    return;
  }

  if (itemById(id)?.status === "waiting") {
    patchItem(id, { status: "paused", pausedBy: "user", message: undefined });
  }
}

export const resumeUpload = (id: string) => retryUpload(id);

export function pauseAll() {
  for (const item of state.queue) {
    if (ACTIVE.includes(item.status)) pauseUpload(item.id);
  }
}

export function resumeAll() {
  set({
    queue: state.queue.map((item) =>
      item.status === "paused" && item.pausedBy === "user"
        ? { ...item, status: "waiting", pausedBy: undefined, message: undefined }
        : item,
    ),
  });
  runQueue();
}

export function cancelAll() {
  for (const item of state.queue) {
    if ([...ACTIVE, "paused"].includes(item.status)) cancelUpload(item.id);
  }
}

export function clearFinished() {
  const keep = state.queue.filter(
    (item) => !["done", "failed", "skipped", "cancelled"].includes(item.status),
  );

  for (const item of state.queue) {
    if (!keep.includes(item)) forget(item.id);
  }

  set({ queue: keep });
}

// Stops everything and forgets the queue (logout).
export function dropQueue() {
  active.forEach((controller) => controller.abort("cancel"));
  pending.clear();
  payloads.forEach((payload) => void payload.discard());
  payloads.clear();
}

// Uploads that stopped for a login continue once it is back.
export function resumeLoginPauses() {
  halted = false;
  set({
    queue: state.queue.map((item) =>
      item.status === "paused" && item.pausedBy === "login"
        ? { ...item, status: "waiting", message: undefined, pausedBy: undefined, waitingFor: undefined }
        : item,
    ),
  });
  runQueue();
}

// The finished upload takes the place of the older file with the same name.
export async function replaceOriginal(itemId: string) {
  const item = itemById(itemId);
  const original = item?.sameNameAs ? fileById(item.sameNameAs) : undefined;

  if (!item?.fileId || !original) {
    return;
  }

  await trashFiles([original.id], true);

  if (fileById(original.id)?.trashedAt) {
    await updateFile(item.fileId, { name: original.name });
    patchItem(itemId, { sameNameAs: undefined, message: `Replaced the older "${original.name}"` });
  }
}

// ---------------------------------------------------------------- placement

// Accounts receiving an upload right now, and a way to wait for one to free up.
const claimed = new Map<string, number>();
let releasedWaiters: (() => void)[] = [];

function claim(ids: string[]) {
  for (const id of ids) claimed.set(id, (claimed.get(id) ?? 0) + 1);
}

function release(ids: string[]) {
  for (const id of ids) {
    const n = (claimed.get(id) ?? 1) - 1;

    if (n > 0) claimed.set(id, n);
    else claimed.delete(id);
  }

  const waiters = releasedWaiters;

  releasedWaiters = [];
  waiters.forEach((wake) => wake());
}

function released(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    releasedWaiters.push(resolve);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

// Space is reserved before the bytes are sent, so parallel uploads don't overfill an account.
const addUsed = (email: string, bytes: number) =>
  setRuntime(email, { used: (state.runtime[email]?.used ?? 0) + bytes });

async function removeQuietly(locations: Location[]) {
  await Promise.all(
    locations.map((location) =>
      adapterFor(location.account)
        .remove(location.fileId)
        .catch(() => {}),
    ),
  );
}

// Progress callback that also keeps the item's speed up to date.
function tracker(itemId: string, total: number, base = 0) {
  const started = Date.now();

  return (sent: number) => {
    const seconds = (Date.now() - started) / 1000;

    patchItem(itemId, {
      progress: total ? Math.min(1, (base + sent) / total) : 1,
      speed: seconds > 0.5 ? sent / seconds : undefined,
    });
  };
}

async function uploadSplit(
  item: UploadItem,
  name: string,
  blob: Blob,
  parts: { id: string; bytes: number }[],
  signal: AbortSignal,
): Promise<Part[]> {
  const layout = splitLayout(parts);
  const sent: Part[] = [];

  try {
    for (const [i, slice] of layout.entries()) {
      const piece = blob.slice(slice.offset, slice.offset + slice.bytes, blob.type);
      const hash = await sha256(piece);

      signal.throwIfAborted();

      const fileId = await adapterFor(slice.id).upload(
        partName(name, i + 1, layout.length),
        piece,
        tracker(item.id, blob.size, slice.offset),
        signal,
      );

      sent.push({
        account: slice.id,
        fileId,
        offset: slice.offset,
        bytes: slice.bytes,
        sha256: hash,
      });
    }
  } catch (error) {
    // Never leave half a file behind.
    await removeQuietly(sent);

    throw error;
  }

  return sent;
}

// Uploads `blob` somewhere it fits: one account, or split after asking.
async function place(
  item: UploadItem,
  name: string,
  blob: Blob,
  signal: AbortSignal,
): Promise<{ location?: Location; parts?: Part[] }> {
  const { routing } = state.index.settings;
  const exclude: string[] = [];

  for (;;) {
    const busy = [...claimed.keys()];
    const placement = plan(accountStates(), blob.size, [...exclude, ...busy], routing);
    const whenFree = busy.length > 0 ? plan(accountStates(), blob.size, exclude, routing) : placement;

    // A busy account would hold it whole, or is needed to fit it at all: wait for it.
    const worthWaiting =
      (whenFree.kind === "single" && placement.kind !== "single") ||
      (whenFree.kind === "split" && placement.kind === "nospace");

    if (worthWaiting) {
      patchItem(item.id, { message: "Waiting for another upload to finish…" });
      await released(signal);
      patchItem(item.id, { message: undefined });

      continue;
    }

    if (placement.kind === "nospace") {
      throw new Error(
        `Not enough free space: short by ${formatBytes(whenFree.kind === "nospace" ? whenFree.shortBy : placement.shortBy)}.`,
      );
    }

    if (placement.kind === "split" && placement.parts.length === 0) {
      throw new Error("No connected account has a known storage limit.");
    }

    const ids = placement.kind === "single" ? [placement.id] : placement.parts.map((p) => p.id);

    if (placement.kind === "split") {
      const ok = await ask({
        title: `Split "${item.name}" across accounts?`,
        body:
          `It is ${formatBytes(blob.size)} and does not fit in any single account. ` +
          `Nebula can store it in ${placement.parts.length} pieces, one per account. ` +
          "If you lose access to any one of them, the whole file is lost.",
        confirm: "Split and upload",
        cancel: "Don't upload",
      });

      if (!ok) {
        throw new Error("Not uploaded: it only fits if split across accounts.");
      }
    }

    claim(ids);

    if (placement.kind === "single") addUsed(placement.id, blob.size);
    else placement.parts.forEach((p) => addUsed(p.id, p.bytes));

    const unreserve = () => {
      if (placement.kind === "single") addUsed(placement.id, -blob.size);
      else placement.parts.forEach((p) => addUsed(p.id, -p.bytes));
    };

    try {
      if (placement.kind === "single") {
        patchItem(item.id, { target: placement.id });

        const fileId = await adapterFor(placement.id).upload(name, blob, tracker(item.id, blob.size), signal);

        return { location: { account: placement.id, fileId } };
      }

      patchItem(item.id, { target: `${placement.parts.length} accounts` });

      return { parts: await uploadSplit(item, name, blob, placement.parts, signal) };
    } catch (error) {
      unreserve();

      if (!(error instanceof QuotaExceededError)) {
        throw error;
      }

      // That account filled up meanwhile: plan again without it.
      exclude.push(error.email);
    } finally {
      release(ids);
    }
  }
}

async function safeCopy(
  item: UploadItem,
  name: string,
  blob: Blob,
  main: Location,
  signal: AbortSignal,
): Promise<Location[] | undefined> {
  const { routing } = state.index.settings;
  // Prefer an idle account; settle for a busy one rather than no copy.
  const second =
    [plan(accountStates(), blob.size, [main.account, ...claimed.keys()], routing),
      plan(accountStates(), blob.size, [main.account], routing)].find((p) => p.kind === "single");

  if (second?.kind !== "single") {
    notify(
      "info",
      `"${item.name}" was uploaded without a safe-mode copy: no second connected account has room.`,
    );

    return undefined;
  }

  patchItem(item.id, { message: "Saving safe-mode copy…", progress: 0, target: second.id });
  claim([second.id]);
  addUsed(second.id, blob.size);

  try {
    const fileId = await adapterFor(second.id).upload(name, blob, tracker(item.id, blob.size), signal);

    return [{ account: second.id, fileId }];
  } catch (error) {
    addUsed(second.id, -blob.size);

    if (signal.aborted) throw error;

    report(error, `No safe-mode copy of "${item.name}": `);

    return undefined;
  } finally {
    release([second.id]);
  }
}

async function thumbnailOf(id: string, file: File) {
  const thumb = await makeThumb(file);

  if (thumb) await saveThumb(id, thumb, state.mode === "private");
}

async function uploadOne(item: UploadItem, signal: AbortSignal) {
  const file = pending.get(item.id);

  if (!file) {
    throw new Error("The file is no longer available. Pick it again.");
  }

  patchItem(item.id, { status: "hashing", progress: 0, message: undefined, speed: undefined });

  const hash = await sha256(file);

  signal.throwIfAborted();

  const duplicate = item.force
    ? undefined
    : state.index.files.find(
        (other) => other.sha256 === hash && other.size === file.size && !other.trashedAt,
      );

  if (duplicate) {
    patchItem(item.id, {
      status: "skipped",
      duplicateOf: duplicate.id,
      message: `Same content is already in Nebula as ${normalizePath(`${duplicate.folder}/${duplicate.name}`)}`,
    });

    return;
  }

  if (connectedEmails().length === 0) {
    throw new Error("Connect a Google account before uploading.");
  }

  const id = crypto.randomUUID();

  // Encrypted files get a neutral name in Drive, so even the name stays private.
  let payload: Blob = file;
  let cipher: Cipher | undefined;
  let driveName = file.name;

  if (state.index.settings.encrypt && state.index.settings.encryption) {
    patchItem(item.id, { message: "Encrypting…" });

    const key = await requireKey();
    const ready = payloads.get(item.id) ?? (await encryptBlob(key, file, signal));

    payloads.set(item.id, ready);
    payload = ready.blob;
    cipher = ready.cipher;
    driveName = `nebula-${hash.slice(0, 16)}.bin`;
  }

  patchItem(item.id, { status: "uploading", message: undefined });

  let stored: { location?: Location; parts?: Part[] } = {};
  let copies: Location[] | undefined;

  try {
    stored = await place(item, driveName, payload, signal);

    if (state.index.settings.safeMode && stored.location) {
      copies = await safeCopy(item, driveName, payload, stored.location, signal);
    }
  } catch (error) {
    // Stopped by the student during the safe-mode copy: take back the main upload.
    // (The signal's reason is thrown, not an AbortError, so check the signal.)
    if (signal.aborted) {
      await removeQuietly([...(stored.location ? [stored.location] : []), ...(stored.parts ?? [])]);

      if (stored.location) addUsed(stored.location.account, -payload.size);
      stored.parts?.forEach((part) => addUsed(part.account, -part.bytes));
    }

    throw error;
  }

  const name = uniqueName(file.name, item.folder);
  const sameNameAs =
    name === file.name
      ? undefined
      : liveIn(item.folder).find((other) => other.name.toLowerCase() === file.name.toLowerCase())?.id;

  await thumbnailOf(id, file);

  await commit({
    ...state.index,
    files: [
      ...state.index.files,
      {
        id,
        name,
        size: file.size,
        type: file.type,
        uploadedAt: new Date().toISOString(),
        sha256: hash,
        location: stored.location,
        parts: stored.parts,
        copies,
        folder: item.folder,
        ...(cipher ? { encrypted: true, cipher } : {}),
      },
    ],
  });

  forget(item.id);
  patchItem(item.id, {
    status: "done",
    progress: 1,
    fileId: id,
    sameNameAs,
    message: sameNameAs ? `Saved as "${name}": this folder already had a "${file.name}"` : undefined,
  });
}

let workers = 0;
// Set when a login expired: no new uploads start until it is back.
let halted = false;
let refreshing: Promise<void> | null = null;

async function work() {
  await (refreshing ??= refreshQuota().finally(() => {
    refreshing = null;
  }));

  while (!halted) {
    const item = state.queue.find((entry) => entry.status === "waiting");

    if (!item) {
      return;
    }

    const controller = new AbortController();

    active.set(item.id, controller);
    patchItem(item.id, { status: "hashing" });

    try {
      await uploadOne(item, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) {
        if (controller.signal.reason === "pause") {
          patchItem(item.id, { status: "paused", pausedBy: "user", message: undefined });
        } else {
          forget(item.id);
          patchItem(item.id, { status: "cancelled", message: undefined, progress: 0 });
        }

        continue;
      }

      if (error instanceof AuthExpiredError) {
        // Hold the queue until the student reconnects.
        setRuntime(error.email, { connected: false });
        halted = true;
        patchItem(item.id, {
          status: "paused",
          pausedBy: "login",
          waitingFor: error.email,
          message: `Waiting for ${error.email}: reconnect it and this upload continues`,
        });

        return;
      }

      patchItem(item.id, {
        status: "failed",
        message: messageOf(error),
        speed: undefined,
      });
    } finally {
      active.delete(item.id);
    }
  }
}

// Starts workers for waiting uploads, up to MAX_PARALLEL.
export function runQueue() {
  const waiting = state.queue.filter((item) => item.status === "waiting").length;

  while (!halted && workers < Math.min(MAX_PARALLEL, waiting)) {
    workers++;
    void work().finally(() => {
      workers--;
    });
  }
}
