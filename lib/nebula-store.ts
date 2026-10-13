import { AuthExpiredError, IntegrityError, QuotaExceededError, messageOf } from "./errors";
import { allFolders, isInside, joinPath, normalizePath, ROOT } from "./folders";
import { formatBytes } from "./format";
import { addAccount, reconnect, signOut, signOutAll } from "./google/auth";
import { sha256 } from "./hash";
import { clearLocalIndex, loadLocalIndex, saveLocalIndex } from "./index-db";
import { createDefaultIndex } from "./index-default";
import { locationsOf, normalizeIndex, reconcile } from "./index-store";
import type {
  FileRecord,
  IndexFile,
  Location,
  Part,
  Routing,
  Theme,
} from "./index-types";
import { partName, splitLayout } from "./split";
import { adapterFor } from "./storage/adapter";
import { DEFAULT_BUFFER, plan, type AccountState } from "./storage/placement";

export const MAX_ACCOUNTS = 5;

const MODE_KEY = "nebula-mode";

export type Mode = "loading" | "ask" | "private" | "public";

export type AccountRuntime = {
  connected: boolean;
  total: number;
  used: number;
};

export type UploadItem = {
  id: string;
  name: string;
  size: number;
  folder: string;
  status: "waiting" | "hashing" | "uploading" | "done" | "failed" | "paused" | "skipped";
  progress: number;
  message?: string;
};

export type Notice = {
  id: number;
  kind: "error" | "info";
  text: string;
};

export type NebulaState = {
  mode: Mode;
  index: IndexFile;
  runtime: Record<string, AccountRuntime>;
  queue: UploadItem[];
  notices: Notice[];
  // File ids with a download, trash or delete in flight.
  busy: string[];
};

const initialState: NebulaState = {
  mode: "loading",
  index: createDefaultIndex(),
  runtime: {},
  queue: [],
  notices: [],
  busy: [],
};

let state = initialState;

const listeners = new Set<() => void>();

// The File objects behind queue items; kept out of state so snapshots stay plain.
const pending = new Map<string, File>();

function set(patch: Partial<NebulaState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export const getState = () => state;
export const getServerState = () => initialState;

// ---------------------------------------------------------------- notices

let noticeId = 0;

function notify(kind: Notice["kind"], text: string) {
  set({ notices: [...state.notices, { id: ++noticeId, kind, text }].slice(-5) });
}

export function dismissNotice(id: number) {
  set({ notices: state.notices.filter((notice) => notice.id !== id) });
}

function setRuntime(email: string, patch: Partial<AccountRuntime>) {
  const current = state.runtime[email] ?? { connected: false, total: 0, used: 0 };

  set({ runtime: { ...state.runtime, [email]: { ...current, ...patch } } });
}

// Fail clearly: every caught error ends up in front of the student.
function report(error: unknown, prefix = "") {
  if (error instanceof AuthExpiredError) {
    setRuntime(error.email, { connected: false });
  }

  notify("error", prefix + messageOf(error));
}

const connectedEmails = () =>
  state.index.accounts
    .map((account) => account.email)
    .filter((email) => state.runtime[email]?.connected);

// ---------------------------------------------------------------- saving

let saveChain: Promise<void> = Promise.resolve();

// IndexedDB first (instant), then every connected account.
function persist() {
  saveChain = saveChain.then(async () => {
    const index = state.index;

    if (state.mode === "private") {
      await saveLocalIndex(index).catch((error) =>
        report(error, "Could not save on this device: "),
      );
    }

    await Promise.all(
      connectedEmails().map((email) =>
        adapterFor(email)
          .writeIndex(index)
          .catch((error) => report(error, `Index not saved to ${email}: `)),
      ),
    );
  });

  return saveChain;
}

function commit(index: IndexFile) {
  set({ index: { ...index, updatedAt: new Date().toISOString() } });

  return persist();
}

const updateFile = (id: string, patch: Partial<FileRecord>) =>
  commit({
    ...state.index,
    files: state.index.files.map((file) =>
      file.id === id ? { ...file, ...patch } : file,
    ),
  });

// ---------------------------------------------------------------- startup

export function init() {
  if (state.mode !== "loading") {
    return;
  }

  let saved: string | null = null;

  try {
    saved = localStorage.getItem(MODE_KEY);
  } catch {
    // Storage blocked: ask every time.
  }

  if (saved === "private") {
    void chooseMode("private");
  } else {
    set({ mode: "ask" });
  }
}

// "public" keeps nothing on this computer; "private" caches the index locally.
export async function chooseMode(mode: "private" | "public") {
  if (mode === "public") {
    try {
      localStorage.removeItem(MODE_KEY);
    } catch {}

    await clearLocalIndex().catch(() => {});
    set({ mode });

    return;
  }

  try {
    localStorage.setItem(MODE_KEY, "private");
  } catch {}

  const cached = normalizeIndex(await loadLocalIndex().catch(() => null));

  set({ mode, index: reconcile(state.index, cached) });
  void persist();
}

// Public-PC logout: revoke every token and forget everything in memory.
export function logoutAll() {
  signOutAll();
  pending.clear();
  set({
    index: state.mode === "public" ? createDefaultIndex() : state.index,
    runtime: {},
    queue: [],
    busy: [],
  });
}

// ---------------------------------------------------------------- accounts

export async function refreshQuota(emails = connectedEmails()) {
  await Promise.all(
    emails.map(async (email) => {
      try {
        setRuntime(email, await adapterFor(email).getQuota());
      } catch (error) {
        report(error, `Could not read space for ${email}: `);
      }
    }),
  );
}

async function afterConnect(email: string) {
  const adapter = adapterFor(email);

  let index = state.index;

  try {
    index = reconcile(index, await adapter.readIndex());
  } catch (error) {
    report(error);
  }

  const known = index.accounts.some((account) => account.email === email);

  if (!known && index.accounts.length >= MAX_ACCOUNTS) {
    signOut(email);
    notify("error", `Nebula pools up to ${MAX_ACCOUNTS} accounts. Remove one first.`);

    return;
  }

  const now = new Date().toISOString();

  const accounts = known
    ? index.accounts.map((account) =>
        account.email === email ? { ...account, lastUsed: now } : account,
      )
    : [
        ...index.accounts,
        {
          email,
          priority: Math.max(0, ...index.accounts.map((a) => a.priority)) + 1,
          buffer: DEFAULT_BUFFER,
          lastUsed: now,
        },
      ];

  setRuntime(email, { connected: true });
  void commit({ ...index, accounts });

  await refreshQuota([email]);

  // Uploads that stopped for this login can continue now.
  set({
    queue: state.queue.map((item) =>
      item.status === "paused" ? { ...item, status: "waiting", message: undefined } : item,
    ),
  });
  void runQueue();
}

// Both must be called straight from a click so the browser allows the popup.
export async function connectAccount() {
  try {
    await afterConnect((await addAccount()).email);
  } catch (error) {
    report(error);
  }
}

export async function reconnectAccount(email: string) {
  try {
    await afterConnect((await reconnect(email)).email);
  } catch (error) {
    report(error);
  }
}

export function disconnectAccount(email: string) {
  signOut(email);
  setRuntime(email, { connected: false });
}

export async function removeAccount(email: string) {
  const holds = state.index.files.some((file) =>
    locationsOf(file).some((location) => location.account === email),
  );

  if (holds) {
    notify(
      "error",
      `${email} still holds Nebula files. Delete them (and empty the trash) before removing it.`,
    );

    return;
  }

  const index = {
    ...state.index,
    accounts: state.index.accounts.filter((account) => account.email !== email),
  };

  await commit(index);

  // The departing account gets this last index too, so its copy is not stale.
  if (state.runtime[email]?.connected) {
    await adapterFor(email)
      .writeIndex(state.index)
      .catch(() => {});
  }

  signOut(email);

  const runtime = { ...state.runtime };

  delete runtime[email];
  set({ runtime });
}

export function movePriority(email: string, direction: -1 | 1) {
  const ordered = [...state.index.accounts].sort((a, b) => a.priority - b.priority);
  const from = ordered.findIndex((account) => account.email === email);
  const to = from + direction;

  if (from < 0 || to < 0 || to >= ordered.length) {
    return;
  }

  [ordered[from], ordered[to]] = [ordered[to], ordered[from]];

  void commit({
    ...state.index,
    accounts: ordered.map((account, i) => ({ ...account, priority: i + 1 })),
  });
}

export function setBuffer(email: string, buffer: number) {
  void commit({
    ...state.index,
    accounts: state.index.accounts.map((account) =>
      account.email === email ? { ...account, buffer: Math.max(0, buffer) } : account,
    ),
  });
}

export function accountStates(): AccountState[] {
  return state.index.accounts.map((account) => {
    const runtime = state.runtime[account.email];

    return {
      id: account.email,
      total: runtime?.total ?? 0,
      used: runtime?.used ?? 0,
      buffer: account.buffer,
      priority: account.priority,
      status: runtime?.connected ? "connected" : "disconnected",
    };
  });
}

// ---------------------------------------------------------------- settings

const setSettings = (patch: Partial<IndexFile["settings"]>) =>
  void commit({ ...state.index, settings: { ...state.index.settings, ...patch } });

export const setRouting = (routing: Routing) => setSettings({ routing });
export const setTheme = (theme: Theme) => setSettings({ theme });
export const setSafeMode = (safeMode: boolean) => setSettings({ safeMode });

// ---------------------------------------------------------------- uploads

function patchItem(id: string, patch: Partial<UploadItem>) {
  set({
    queue: state.queue.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  });
}

export function enqueue(files: File[], folder: string) {
  const items = files.map((file): UploadItem => {
    const id = crypto.randomUUID();

    pending.set(id, file);

    return {
      id,
      name: file.name,
      size: file.size,
      folder,
      status: "waiting",
      progress: 0,
    };
  });

  set({ queue: [...state.queue, ...items] });
  void runQueue();
}

export function retryUpload(id: string) {
  patchItem(id, { status: "waiting", progress: 0, message: undefined });
  void runQueue();
}

export function clearFinished() {
  const keep = state.queue.filter(
    (item) => !["done", "failed", "skipped"].includes(item.status),
  );

  for (const item of state.queue) {
    if (!keep.includes(item)) pending.delete(item.id);
  }

  set({ queue: keep });
}

// Count bytes we just placed so the next file in a batch sees less free space.
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

async function uploadSplit(
  item: UploadItem,
  file: File,
  parts: { id: string; bytes: number }[],
): Promise<Part[]> {
  const layout = splitLayout(parts);
  const sent: Part[] = [];

  try {
    for (const [i, slice] of layout.entries()) {
      const blob = file.slice(slice.offset, slice.offset + slice.bytes, file.type);
      const hash = await sha256(blob);

      const fileId = await adapterFor(slice.id).upload(
        partName(file.name, i + 1, layout.length),
        blob,
        (n) => patchItem(item.id, { progress: (slice.offset + n) / file.size }),
      );

      sent.push({
        account: slice.id,
        fileId,
        offset: slice.offset,
        bytes: slice.bytes,
        sha256: hash,
      });
      addUsed(slice.id, slice.bytes);
    }
  } catch (error) {
    // Never leave half a file behind.
    await removeQuietly(sent);
    sent.forEach((part) => addUsed(part.account, -part.bytes));

    throw error;
  }

  return sent;
}

async function uploadOne(item: UploadItem) {
  const file = pending.get(item.id);

  if (!file) {
    throw new Error("The file is no longer available. Pick it again.");
  }

  patchItem(item.id, { status: "hashing", progress: 0, message: undefined });

  const hash = await sha256(file);

  const duplicate = state.index.files.find(
    (other) => other.sha256 === hash && other.size === file.size && !other.trashedAt,
  );

  if (duplicate) {
    patchItem(item.id, {
      status: "skipped",
      message: `Already in Nebula as ${normalizePath(`${duplicate.folder}/${duplicate.name}`)}`,
    });

    return;
  }

  if (connectedEmails().length === 0) {
    throw new Error("Connect a Google account before uploading.");
  }

  patchItem(item.id, { status: "uploading" });

  const { routing, safeMode } = state.index.settings;
  const exclude: string[] = [];

  let location: Location | undefined;
  let parts: Part[] | undefined;

  while (!location && !parts) {
    const placement = plan(accountStates(), file.size, exclude, routing);

    if (placement.kind === "nospace") {
      throw new Error(
        `Not enough free space: short by ${formatBytes(placement.shortBy)}.`,
      );
    }

    if (placement.kind === "split" && placement.parts.length === 0) {
      throw new Error("No connected account has a known storage limit.");
    }

    try {
      if (placement.kind === "single") {
        const fileId = await adapterFor(placement.id).upload(file.name, file, (n) =>
          patchItem(item.id, { progress: file.size ? n / file.size : 1 }),
        );

        location = { account: placement.id, fileId };
        addUsed(placement.id, file.size);
      } else {
        const ok = window.confirm(
          `"${file.name}" (${formatBytes(file.size)}) does not fit in any single account.\n\n` +
            `Split it across ${placement.parts.length} accounts? ` +
            "If you lose access to any one of them, the whole file is lost.",
        );

        if (!ok) {
          throw new Error("Not uploaded: it only fits if split across accounts.");
        }

        parts = await uploadSplit(item, file, placement.parts);
      }
    } catch (error) {
      if (!(error instanceof QuotaExceededError)) {
        throw error;
      }

      // That account filled up meanwhile: plan again without it.
      exclude.push(error.email);
    }
  }

  let copies: Location[] | undefined;

  if (safeMode && location) {
    const second = plan(accountStates(), file.size, [location.account], routing);

    if (second.kind === "single") {
      patchItem(item.id, { message: "Saving safe-mode copy…", progress: 0 });

      try {
        const fileId = await adapterFor(second.id).upload(file.name, file, (n) =>
          patchItem(item.id, { progress: file.size ? n / file.size : 1 }),
        );

        copies = [{ account: second.id, fileId }];
        addUsed(second.id, file.size);
      } catch (error) {
        report(error, `No safe-mode copy of "${file.name}": `);
      }
    } else {
      notify(
        "info",
        `"${file.name}" was uploaded without a safe-mode copy: no second connected account has room.`,
      );
    }
  }

  await commit({
    ...state.index,
    files: [
      ...state.index.files,
      {
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: file.type,
        uploadedAt: new Date().toISOString(),
        sha256: hash,
        location,
        parts,
        copies,
        folder: item.folder,
      },
    ],
  });

  pending.delete(item.id);
  patchItem(item.id, { status: "done", progress: 1, message: undefined });
}

let running = false;

// One file at a time, so no account ever receives two uploads at once.
async function runQueue() {
  if (running) {
    return;
  }

  running = true;

  try {
    await refreshQuota();

    for (;;) {
      const item = state.queue.find((entry) => entry.status === "waiting");

      if (!item) {
        break;
      }

      try {
        await uploadOne(item);
      } catch (error) {
        if (error instanceof AuthExpiredError) {
          // Pause the queue until the student reconnects.
          setRuntime(error.email, { connected: false });
          patchItem(item.id, {
            status: "paused",
            message: `Reconnect ${error.email} to continue`,
          });

          break;
        }

        patchItem(item.id, { status: "failed", message: messageOf(error) });
      }
    }
  } finally {
    running = false;
  }
}

// ---------------------------------------------------------------- files

const fileById = (id: string) => state.index.files.find((file) => file.id === id);

async function whileBusy(id: string, work: () => Promise<void>) {
  if (state.busy.includes(id)) {
    return;
  }

  set({ busy: [...state.busy, id] });

  try {
    await work();
  } catch (error) {
    report(error);
  } finally {
    set({ busy: state.busy.filter((other) => other !== id) });
  }
}

async function fetchChecked(location: Location, hash: string, name: string) {
  const blob = await adapterFor(location.account).download(location.fileId);

  if ((await sha256(blob)) !== hash) {
    throw new IntegrityError(name);
  }

  return blob;
}

// Downloads a file and refuses it unless every hash matches.
async function fetchVerified(file: FileRecord): Promise<Blob> {
  if (file.parts) {
    const blobs: Blob[] = [];

    for (const part of [...file.parts].sort((a, b) => a.offset - b.offset)) {
      blobs.push(await fetchChecked(part, part.sha256, file.name));
    }

    const whole = new Blob(blobs, { type: file.type });

    if ((await sha256(whole)) !== file.sha256) {
      throw new IntegrityError(file.name);
    }

    return whole;
  }

  // The main copy first, then any safe-mode copy.
  let failure: unknown = new Error(`"${file.name}" has no stored location.`);

  for (const location of [file.location, ...(file.copies ?? [])]) {
    if (!location) continue;

    try {
      const blob = await fetchChecked(location, file.sha256, file.name);

      return new Blob([blob], { type: file.type });
    } catch (error) {
      if (error instanceof AuthExpiredError) {
        setRuntime(error.email, { connected: false });
      }

      failure = error;
    }
  }

  throw failure;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const downloadFile = (id: string) =>
  whileBusy(id, async () => {
    const file = fileById(id);

    if (file) {
      saveBlob(await fetchVerified(file), file.name);
    }
  });

async function setTrashedEverywhere(file: FileRecord, trashed: boolean) {
  for (const location of locationsOf(file)) {
    await adapterFor(location.account).setTrashed(location.fileId, trashed);
  }
}

export const trashFile = (id: string) =>
  whileBusy(id, async () => {
    const file = fileById(id);

    if (file) {
      await setTrashedEverywhere(file, true);
      await updateFile(id, { trashedAt: new Date().toISOString() });
    }
  });

export const restoreFile = (id: string) =>
  whileBusy(id, async () => {
    const file = fileById(id);

    if (file) {
      await setTrashedEverywhere(file, false);
      await updateFile(id, { trashedAt: undefined });
    }
  });

// Deletes the file, every split part and every safe-mode copy.
export const deleteForever = (id: string) =>
  whileBusy(id, async () => {
    const file = fileById(id);

    if (!file) {
      return;
    }

    for (const location of locationsOf(file)) {
      await adapterFor(location.account).remove(location.fileId);
    }

    await commit({
      ...state.index,
      files: state.index.files.filter((other) => other.id !== id),
    });
    void refreshQuota();
  });

export async function emptyTrash() {
  for (const file of state.index.files.filter((entry) => entry.trashedAt)) {
    await deleteForever(file.id);
  }
}

// ---------------------------------------------------------------- folders

// Moving only edits the path in the index; no bytes move between accounts.
export function moveFile(id: string, folder: string) {
  const file = fileById(id);

  if (file && file.folder !== folder) {
    void updateFile(id, { folder });
  }
}

export function createFolder(parent: string, name: string) {
  if (!name.trim()) {
    return;
  }

  const path = joinPath(parent, name);

  if (path !== ROOT && !state.index.folders.includes(path)) {
    void commit({ ...state.index, folders: [...state.index.folders, path] });
  }
}

export function deleteFolder(path: string) {
  if (state.index.files.some((file) => isInside(file.folder, path))) {
    notify("error", "Only empty folders can be deleted. Move or delete its files first (and empty the trash).");

    return;
  }

  void commit({
    ...state.index,
    folders: state.index.folders.filter((folder) => !isInside(folder, path)),
  });
}

export const foldersOf = (index: IndexFile) =>
  allFolders([...index.folders, ...index.files.map((file) => file.folder)]);
