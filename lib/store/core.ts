// State, notices, dialogs and saving: everything the other store modules share.
import { AuthExpiredError, messageOf } from "../errors";
import { saveLocalIndex } from "../index-db";
import { createDefaultIndex } from "../index-default";
import { reconcile, stamp } from "../index-store";
import type { FileRecord, IndexFile } from "../index-types";
import { adapterFor } from "../storage/adapter";

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
  status:
    | "waiting"
    | "hashing"
    | "uploading"
    | "done"
    | "failed"
    | "paused"
    | "skipped"
    | "cancelled";
  progress: number;
  message?: string;
  // "login": waits for a reconnect; "user": waits for Resume.
  pausedBy?: "login" | "user";
  // The account a "login" pause waits for.
  waitingFor?: string;
  // Where the bytes are going: an email, or "3 accounts" for a split file.
  target?: string;
  // Average bytes per second since this upload started.
  speed?: number;
  // Upload even though the same content is already stored.
  force?: boolean;
  // The existing file this one duplicates (skipped items).
  duplicateOf?: string;
  // The file record created by this upload.
  fileId?: string;
  // A different file with the same name in the same folder.
  sameNameAs?: string;
};

export type NoticeAction =
  | { kind: "reconnect"; email: string; label?: string }
  | { kind: "undo"; id: number };

export type Notice = {
  id: number;
  kind: "error" | "info" | "success";
  text: string;
  action?: NoticeAction;
  // Stays until dismissed even though it is not an error.
  sticky?: boolean;
};

// An in-app question; replaces window.confirm and window.prompt.
export type Dialog = {
  id: number;
  title: string;
  body?: string;
  confirm: string;
  cancel?: string;
  danger?: boolean;
  // Present for questions that take a text answer.
  input?: { label: string; value: string; secret?: boolean };
  // Present for questions answered by picking one of several buttons.
  choices?: { label: string; value: string }[];
};

// A long-running bulk job, such as emptying the trash.
export type Task = {
  label: string;
  done: number;
  total: number;
};

export type NebulaState = {
  mode: Mode;
  index: IndexFile;
  runtime: Record<string, AccountRuntime>;
  queue: UploadItem[];
  notices: Notice[];
  // File ids with a download, trash or delete in flight.
  busy: string[];
  // Download progress (0..1) by file id; 1 means the hashes are being checked.
  progress: Record<string, number>;
  dialogs: Dialog[];
  task?: Task;
  // The encryption key is in memory for this session.
  unlocked: boolean;
};

const initialState: NebulaState = {
  mode: "loading",
  index: createDefaultIndex(),
  runtime: {},
  queue: [],
  notices: [],
  busy: [],
  progress: {},
  dialogs: [],
  unlocked: false,
};

export let state = initialState;

const listeners = new Set<() => void>();

export function set(patch: Partial<NebulaState>) {
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

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const isAbort = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

export const fileById = (id: string) => state.index.files.find((file) => file.id === id);

export const describeFiles = (ids: string[]) =>
  ids.length === 1 ? `"${fileById(ids[0])?.name ?? "File"}"` : plural(ids.length, "file");

// True while closing the tab would lose work in progress.
export const hasWorkInProgress = (s: NebulaState = state) =>
  s.busy.length > 0 ||
  Boolean(s.task) ||
  s.queue.some((item) => ["waiting", "hashing", "uploading"].includes(item.status));

// ---------------------------------------------------------------- notices

let noticeId = 0;

export function notify(
  kind: Notice["kind"],
  text: string,
  action?: NoticeAction,
  sticky?: boolean,
) {
  set({
    notices: [...state.notices, { id: ++noticeId, kind, text, action, sticky }].slice(-5),
  });
}

const undos = new Map<number, () => unknown>();

let undoId = 0;

// A success message with an Undo button that runs `undo`.
export function notifyUndo(text: string, undo: () => unknown) {
  const id = ++undoId;

  undos.set(id, undo);
  notify("success", text, { kind: "undo", id });
}

export function takeUndo(id: number) {
  const undo = undos.get(id);

  undos.delete(id);

  return undo;
}

export function dismissNotice(id: number) {
  const notice = state.notices.find((n) => n.id === id);

  if (notice?.action?.kind === "undo") undos.delete(notice.action.id);

  set({ notices: state.notices.filter((n) => n.id !== id) });
}

export function setRuntime(email: string, patch: Partial<AccountRuntime>) {
  const current = state.runtime[email] ?? { connected: false, total: 0, used: 0 };

  set({ runtime: { ...state.runtime, [email]: { ...current, ...patch } } });
}

// Fail clearly: every caught error ends up in front of the student.
export function report(error: unknown, prefix = "") {
  if (error instanceof AuthExpiredError) {
    setRuntime(error.email, { connected: false });
    notify("error", prefix + messageOf(error), { kind: "reconnect", email: error.email });

    return;
  }

  notify("error", prefix + messageOf(error));
}

export const connectedEmails = () =>
  state.index.accounts
    .map((account) => account.email)
    .filter((email) => state.runtime[email]?.connected);

// ---------------------------------------------------------------- dialogs

let dialogId = 0;

const answers = new Map<number, (answer: string | boolean | null) => void>();

function openDialog(dialog: Omit<Dialog, "id">) {
  const id = ++dialogId;

  // Register the answer first: a listener may answer as soon as it is shown.
  const answer = new Promise<string | boolean | null>((resolve) => answers.set(id, resolve));

  set({ dialogs: [...state.dialogs, { ...dialog, id }] });

  return answer;
}

// Yes/no question. Resolves false when dismissed.
export const ask = async (dialog: Omit<Dialog, "id" | "input">) =>
  (await openDialog(dialog)) === true;

// Text question. Resolves with the trimmed answer (untrimmed when secret), or
// null when dismissed or empty.
export async function askText(
  dialog: Omit<Dialog, "id" | "input"> & { label: string; value?: string; secret?: boolean },
) {
  const { label, value = "", secret, ...rest } = dialog;
  const answer = await openDialog({ ...rest, input: { label, value, secret } });

  if (typeof answer !== "string" || !answer.trim()) return null;

  return secret ? answer : answer.trim();
}

// Several-way question. Resolves with the chosen value, or null when dismissed.
export async function askChoice(
  dialog: Omit<Dialog, "id" | "input" | "confirm"> & { choices: { label: string; value: string }[] },
) {
  const answer = await openDialog({ ...dialog, confirm: "" });

  return typeof answer === "string" ? answer : null;
}

// ok: true/false for questions, the text (or null to cancel) for text questions,
// the chosen value (or null) for choices.
export function answerDialog(id: number, ok: boolean | string | null) {
  set({ dialogs: state.dialogs.filter((dialog) => dialog.id !== id) });
  answers.get(id)?.(ok);
  answers.delete(id);
}

// ---------------------------------------------------------------- saving

let dirty = false;
let flushing: Promise<void> | null = null;

// The index version each account last received, so unchanged copies are skipped.
const written = new Map<string, string>();

export const markWritten = (email: string, updatedAt: string) => written.set(email, updatedAt);

// The account's copy is stale: the next save writes to it even if nothing changed.
export const markStale = (email: string) => written.delete(email);

// The version of each account's stored index that this tab last read or wrote.
const versions = new Map<string, string>();

// An account's stored index, or null when it is unchanged since this tab last
// read or wrote it: a small version check instead of downloading the whole list.
export async function readIfChanged(email: string): Promise<IndexFile | null> {
  const adapter = adapterFor(email);
  const version = await adapter.indexVersion().catch(() => null);

  if (version && version === versions.get(email)) return null;

  const remote = await adapter.readIndex();

  if (version) versions.set(email, version);

  return remote;
}

// Everything but the version stamp.
export const sameContent = (a: IndexFile, b: IndexFile) =>
  JSON.stringify({ ...a, updatedAt: "" }) === JSON.stringify({ ...b, updatedAt: "" });

// Reads the accounts about to be written. A copy another device changed since
// this one last saw it is merged in first, so its changes are not overwritten.
async function mergeRemote(emails: string[]) {
  const remotes = await Promise.all(
    emails.map((email) => readIfChanged(email).catch(() => null)),
  );

  let merged = state.index;

  remotes.forEach((remote, i) => {
    if (remote && remote.updatedAt !== written.get(emails[i])) {
      merged = reconcile(merged, remote);
    }
  });

  if (!sameContent(merged, state.index)) {
    set({ index: { ...merged, updatedAt: nextStamp() } });
  }
}

// Changes made while a save is running are batched into one next save.
async function flush() {
  try {
    while (dirty) {
      dirty = false;

      const targets = connectedEmails().filter((email) => written.get(email) !== state.index.updatedAt);

      if (targets.length > 0) await mergeRemote(targets);

      const index = state.index;

      if (state.mode === "private") {
        await saveLocalIndex(index).catch((error) =>
          report(error, "Could not save on this device: "),
        );
      }

      await Promise.all(
        connectedEmails()
          .filter((email) => written.get(email) !== index.updatedAt)
          .map((email) =>
            adapterFor(email)
              .writeIndex(index)
              .then((version) => {
                markWritten(email, index.updatedAt);

                if (version) versions.set(email, version);
              })
              .catch((error) => report(error, `Index not saved to ${email}: `)),
          ),
      );
    }
  } finally {
    flushing = null;
  }
}

// IndexedDB first (instant), then every connected account whose copy is out of date.
export function persist() {
  dirty = true;
  flushing ??= flush();

  return flushing;
}

// Strictly increasing, even for two changes in the same millisecond: an equal
// stamp would look already saved and be skipped.
export function nextStamp() {
  const last = Date.parse(state.index.updatedAt) || 0;

  return new Date(Math.max(Date.now(), last + 1)).toISOString();
}

// A change made here: stamped, so merges know it is the newest.
export function commit(index: IndexFile) {
  set({ index: stamp(state.index, index, nextStamp()) });

  return persist();
}

// An index merged from another copy: taken as it is.
export function adopt(index: IndexFile) {
  set({ index });

  return persist();
}

export const updateFiles = (ids: string[], patch: Partial<FileRecord>) =>
  commit({
    ...state.index,
    files: state.index.files.map((file) =>
      ids.includes(file.id) ? { ...file, ...patch } : file,
    ),
  });

export const updateFile = (id: string, patch: Partial<FileRecord>) => updateFiles([id], patch);

// ---------------------------------------------------------------- busy work

export async function whileBusy(id: string, work: () => Promise<void>) {
  if (state.busy.includes(id)) {
    return;
  }

  set({ busy: [...state.busy, id] });

  try {
    await work();
  } catch (error) {
    if (!isAbort(error)) report(error);
  } finally {
    const progress = { ...state.progress };

    delete progress[id];
    set({ busy: state.busy.filter((other) => other !== id), progress });
  }
}

// Runs one step per item and shows a progress bar for anything longer than one.
export async function inBulk<T>(label: string, items: T[], step: (item: T) => Promise<void>) {
  const total = items.length;

  if (total > 1) set({ task: { label, done: 0, total } });

  try {
    for (const [i, item] of items.entries()) {
      await step(item);

      if (total > 1) set({ task: { label, done: i + 1, total } });
    }
  } finally {
    if (total > 1) set({ task: undefined });
  }
}

// Resolves once the file is no longer busy.
export function whenIdle(id: string) {
  return new Promise<void>((resolve) => {
    if (!state.busy.includes(id)) return resolve();

    const stop = subscribe(() => {
      if (!state.busy.includes(id)) {
        stop();
        resolve();
      }
    });
  });
}
