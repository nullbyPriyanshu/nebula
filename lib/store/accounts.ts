// Modes, accounts, logins, settings and syncing the index between copies.
import { clearUploadTemp } from "../crypto";
import { rememberSessions } from "../google/drive";
import { addAccount, reconnect, signOut, signOutAll } from "../google/auth";
import { clearLocalIndex, loadLocalIndex } from "../index-db";
import { createDefaultIndex } from "../index-default";
import { locationsOf, normalizeIndex, reconcile } from "../index-store";
import type { IndexFile, Routing, Theme } from "../index-types";
import { adapterFor } from "../storage/adapter";
import { DEFAULT_BUFFER, type AccountState } from "../storage/placement";
import { forgetOpened } from "../recent";
import { forgetSearches } from "../search";
import { clearThumbs } from "../thumbs";
import {
  adopt,
  commit,
  connectedEmails,
  dismissNotice,
  markStale,
  markWritten,
  nextStamp,
  notify,
  persist,
  readIfChanged,
  report,
  sameContent,
  set,
  setRuntime,
  state,
  takeUndo,
} from "./core";
import { purgeOldTrash, revokeExpiredShares } from "./files";
import { abortTransfers } from "./transfers";
import { dropQueue, loadInterrupted, resumeLoginPauses } from "./uploads";
import { lock } from "./vault";

export const MAX_ACCOUNTS = 5;

const MODE_KEY = "nebula-mode";

// How long before a login ends the student is offered to renew it.
const WARN_BEFORE = 5 * 60 * 1000;

// ---------------------------------------------------------------- startup

export function init() {
  if (state.mode !== "loading") {
    return;
  }

  // Encrypted uploads from a closed tab may have left temporary files.
  void clearUploadTemp();

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
    await clearThumbs();
    forgetOpened();
    forgetSearches();
    rememberSessions(false);

    try {
      localStorage.removeItem("nebula-interrupted-uploads");
    } catch {}

    set({ mode, interrupted: [] });

    return;
  }

  try {
    localStorage.setItem(MODE_KEY, "private");
  } catch {}

  const cached = normalizeIndex(await loadLocalIndex().catch(() => null));

  rememberSessions(true);
  loadInterrupted();
  set({ mode, index: reconcile(state.index, cached) });
  void persist();
}

// Public-PC logout: revoke every token and forget everything in memory.
export function logoutAll() {
  signOutAll();
  dropQueue();
  abortTransfers();
  lock();
  expiryTimers.forEach((timers) => timers.forEach(clearTimeout));
  expiryTimers.clear();

  if (state.mode === "public") {
    void clearThumbs();
    forgetOpened();
  }

  set({
    index: state.mode === "public" ? createDefaultIndex() : state.index,
    runtime: {},
    queue: [],
    busy: [],
    progress: {},
  });
}

// Called straight from the notice's button, so a reconnect popup is allowed.
export function runNoticeAction(id: number) {
  const action = state.notices.find((notice) => notice.id === id)?.action;

  if (action?.kind === "undo") {
    const undo = takeUndo(action.id);

    dismissNotice(id);
    void undo?.();
  } else if (action?.kind === "reconnect") {
    dismissNotice(id);
    void reconnectAccount(action.email);
  }
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

const expiryTimers = new Map<string, ReturnType<typeof setTimeout>[]>();

// Offers to renew a login shortly before it ends, and shows it as ended the
// moment it does rather than at the next failed request.
function watchExpiry(email: string, expiresAt?: number) {
  expiryTimers.get(email)?.forEach(clearTimeout);
  expiryTimers.delete(email);

  if (typeof expiresAt !== "number") {
    return;
  }

  const left = expiresAt - Date.now();
  const timers = [
    setTimeout(() => {
      if (state.runtime[email]?.connected) {
        setRuntime(email, { connected: false });
        notify("info", `The login for ${email} ended.`, { kind: "reconnect", email }, true);
      }
    }, Math.max(0, left)),
  ];

  if (left > WARN_BEFORE) {
    timers.push(
      setTimeout(() => {
        if (state.runtime[email]?.connected) {
          notify(
            "info",
            `The login for ${email} ends in 5 minutes.`,
            { kind: "reconnect", email, label: "Stay signed in" },
            true,
          );
        }
      }, left - WARN_BEFORE),
    );
  }

  expiryTimers.set(email, timers);
}

async function afterConnect(email: string, expiresAt?: number) {
  let index = state.index;

  try {
    const remote = await readIfChanged(email);

    if (remote) markWritten(email, remote.updatedAt);

    index = reconcile(index, remote);
  } catch (error) {
    report(error);
  }

  const known = index.accounts.some((account) => account.email === email);

  if (!known && index.accounts.length >= MAX_ACCOUNTS) {
    signOut(email);
    notify("error", `Nebula pools up to ${MAX_ACCOUNTS} accounts. Remove one first.`);

    return;
  }

  // Take the merged copy as it is; only this account's own record is a new change.
  if (index !== state.index) set({ index });

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
  watchExpiry(email, expiresAt);
  void commit({ ...index, accounts });
  notify("success", `${email} is connected.`);

  await refreshQuota([email]);

  resumeLoginPauses();
  void purgeOldTrash();
  void revokeExpiredShares();
}

// Both must be called straight from a click so the browser allows the popup.
export async function connectAccount() {
  try {
    const account = await addAccount();

    await afterConnect(account.email, account.expiresAt);
  } catch (error) {
    report(error);
  }
}

export async function reconnectAccount(email: string) {
  try {
    const account = await reconnect(email);

    await afterConnect(account.email, account.expiresAt);
  } catch (error) {
    report(error);
  }
}

export function disconnectAccount(email: string) {
  signOut(email);
  watchExpiry(email);
  setRuntime(email, { connected: false });
}

// Live and trashed files with at least one piece in the account.
export const filesIn = (email: string, index = state.index) =>
  index.files.filter((file) =>
    locationsOf(file).some((location) => location.account === email),
  );

export async function removeAccount(email: string) {
  if (filesIn(email).length > 0) {
    notify(
      "error",
      `${email} still holds Nebula files. Move them off it (or delete them) before removing it.`,
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
  watchExpiry(email);

  const runtime = { ...state.runtime };

  delete runtime[email];
  set({ runtime });
  notify("success", `${email} was removed from Nebula.`);
}

// Puts the accounts in the given order: the first gets priority 1.
export function reorderAccounts(emails: string[]) {
  const rank = (email: string) => {
    const i = emails.indexOf(email);

    return i < 0 ? emails.length : i;
  };

  const ordered = [...state.index.accounts].sort(
    (a, b) => rank(a.email) - rank(b.email) || a.priority - b.priority,
  );

  void commit({
    ...state.index,
    accounts: ordered.map((account, i) =>
      account.priority === i + 1 ? account : { ...account, priority: i + 1 },
    ),
  });
}

export function movePriority(email: string, direction: -1 | 1) {
  const ordered = [...state.index.accounts]
    .sort((a, b) => a.priority - b.priority)
    .map((account) => account.email);
  const from = ordered.indexOf(email);
  const to = from + direction;

  if (from < 0 || to < 0 || to >= ordered.length) {
    return;
  }

  [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
  reorderAccounts(ordered);
}

export function setBuffer(email: string, buffer: number) {
  const value = Number.isFinite(buffer) ? Math.max(0, buffer) : 0;

  void commit({
    ...state.index,
    accounts: state.index.accounts.map((account) =>
      account.email === email ? { ...account, buffer: value } : account,
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

// ---------------------------------------------------------------- sync

let syncing = false;

// Pulls every connected account's copy and merges it in, so changes made in
// another tab or on another device show up here, and stale copies get rewritten.
export async function syncNow() {
  if (syncing || (state.mode !== "private" && state.mode !== "public")) {
    return;
  }

  syncing = true;

  try {
    const remotes = new Map<string, IndexFile>();

    await Promise.all(
      connectedEmails().map(async (email) => {
        try {
          // Unchanged since this tab last saw it: nothing new to merge.
          const remote = await readIfChanged(email);

          if (remote) remotes.set(email, remote);
        } catch {
          // Quietly: this runs in the background. A real failure shows on the next save.
        }
      }),
    );

    let merged = state.index;

    for (const remote of remotes.values()) {
      merged = reconcile(merged, remote);
    }

    let stale = false;

    for (const [email, remote] of remotes) {
      if (!sameContent(remote, merged)) {
        markStale(email);
        stale = true;
      }
    }

    if (!sameContent(merged, state.index)) {
      void adopt({ ...merged, updatedAt: nextStamp() });
    } else if (stale) {
      void persist();
    }
  } finally {
    syncing = false;
  }
}
