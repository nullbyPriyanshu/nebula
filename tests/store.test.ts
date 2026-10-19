import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IndexFile } from "../lib/index-types";
import type { DriveAdapter } from "../lib/storage/adapter";

// In-memory stand-ins for Google, the login popup and IndexedDB.
type Fake = DriveAdapter & {
  files: Map<string, Blob>;
  names: Map<string, string>;
  trashed: Set<string>;
  index: IndexFile | null;
  // Bumped on every write, like Drive's file version.
  version: number;
  reads: number;
  total: number;
  used: number;
  failUpload?: Error;
};

const world = vi.hoisted(() => ({
  fakes: new Map<string, unknown>(),
  nextLogin: "",
  passphrase: "secret words",
  local: null as unknown,
  saved: null as Blob | null,
  ids: 0,
}));

const fake = (email: string) => world.fakes.get(email) as Fake;

function addFake(email: string, total: number, used = 0) {
  const adapter: Fake = {
    id: `google:${email}`,
    email,
    files: new Map(),
    names: new Map(),
    trashed: new Set(),
    index: null,
    version: 0,
    reads: 0,
    total,
    used,
    getQuota: async () => ({ total: adapter.total, used: adapter.used }),
    upload: async (name, blob, onProgress) => {
      if (adapter.failUpload) {
        const error = adapter.failUpload;

        adapter.failUpload = undefined;
        throw error;
      }

      const id = `${email}-${++world.ids}`;

      adapter.files.set(id, blob);
      adapter.names.set(id, name);
      adapter.used += blob.size;
      onProgress?.(blob.size);

      return id;
    },
    download: async (id) => {
      const blob = adapter.files.get(id);

      if (!blob) throw new Error("missing");

      return blob;
    },
    setTrashed: async (id, trashed) => {
      if (trashed) adapter.trashed.add(id);
      else adapter.trashed.delete(id);
    },
    remove: async (id) => {
      adapter.files.delete(id);
      adapter.trashed.delete(id);
    },
    open: async (id) => {
      const blob = adapter.files.get(id);

      if (!blob) throw new Error("missing");

      return blob.stream();
    },
    rename: async (id, name) => {
      adapter.names.set(id, name);
    },
    thumbnail: async () => null,
    share: async (id) => `perm-${id}`,
    unshare: async () => {},
    readIndex: async () => {
      adapter.reads++;

      return adapter.index;
    },
    writeIndex: async (index) => {
      adapter.index = index;
      adapter.version++;

      return String(adapter.version);
    },
    indexVersion: async () => (adapter.index ? String(adapter.version) : null),
  };

  world.fakes.set(email, adapter);

  return adapter;
}

vi.mock("../lib/storage/adapter", () => ({
  adapterFor: (email: string) => world.fakes.get(email),
}));

vi.mock("../lib/google/auth", () => ({
  addAccount: async () => ({ email: world.nextLogin }),
  reconnect: async (email: string) => ({ email }),
  signOut: () => {},
  signOutAll: () => {},
}));

vi.mock("../lib/index-db", () => ({
  loadLocalIndex: async () => world.local,
  saveLocalIndex: async (index: unknown) => {
    world.local = index;
  },
  clearLocalIndex: async () => {
    world.local = null;
  },
}));

type Store = typeof import("../lib/nebula-store");

type Errors = typeof import("../lib/errors");

// Answers the split question the way the test chose, and gives the passphrase.
function answerDialogs(target: Store) {
  target.subscribe(() => {
    const dialog = target.getState().dialogs[0];

    if (dialog) target.answerDialog(dialog.id, dialog.input ? world.passphrase : confirmSplit);
  });
}

// Re-imported for every test so each starts with an empty store.
let store: Store;
let errorTypes: Errors;
let confirmSplit = true;

// Connects with no free buffer, so byte-sized fake accounts have usable space.
async function connect(email: string) {
  world.nextLogin = email;
  await store.connectAccount();
  store.setBuffer(email, 0);
}

// Waits until the upload queue has nothing left in flight.
const settle = () =>
  vi.waitFor(() => {
    const active = store
      .getState()
      .queue.some((item) => ["waiting", "hashing", "uploading"].includes(item.status));

    if (active) throw new Error("still uploading");
  });

async function upload(name: string, content: string, folder = "/") {
  store.enqueue([new File([content], name, { type: "text/plain" })], folder);
  await settle();

  return store.getState().queue.at(-1)!;
}

const fileNamed = (name: string) =>
  store.getState().index.files.find((file) => file.name === name)!;

const errors = () =>
  store.getState().notices.filter((n) => n.kind === "error").map((n) => n.text);

beforeEach(async () => {
  vi.resetModules();
  world.fakes.clear();
  world.local = null;
  world.saved = null;
  confirmSplit = true;

  vi.stubGlobal("window", {});
  vi.stubGlobal("document", {
    createElement: () => ({ click: () => {}, remove: () => {} }),
    body: { appendChild: () => {} },
  });
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    world.saved = blob as Blob;

    return "blob:test";
  });

  store = await import("../lib/nebula-store");
  errorTypes = await import("../lib/errors");

  answerDialogs(store);
  await store.chooseMode("private");
});

describe("accounts and index", () => {
  it("writes the index to this device and to every connected account", async () => {
    addFake("a@gmail.com", 100);
    addFake("b@gmail.com", 100);
    await connect("a@gmail.com");
    await connect("b@gmail.com");
    await upload("notes.txt", "hello");

    const saved = fake("a@gmail.com").index!;

    expect(saved.files.map((f) => f.name)).toEqual(["notes.txt"]);
    expect(saved.accounts.map((a) => a.email)).toEqual(["a@gmail.com", "b@gmail.com"]);
    expect(fake("b@gmail.com").index).toEqual(saved);
    expect(world.local).toEqual(saved);
  });

  it("recovers the full list on a new device from one reconnected account", async () => {
    addFake("a@gmail.com", 100);
    addFake("b@gmail.com", 100);
    await connect("a@gmail.com");
    await connect("b@gmail.com");
    await upload("notes.txt", "hello");

    // A new browser: nothing cached, a fresh store.
    world.local = null;
    vi.resetModules();
    store = await import("../lib/nebula-store");
    await store.chooseMode("private");
    await connect("b@gmail.com");

    const { index, runtime } = store.getState();

    expect(index.files.map((f) => f.name)).toEqual(["notes.txt"]);
    expect(index.accounts).toHaveLength(2);
    expect(runtime["a@gmail.com"]?.connected).toBeFalsy();
  });

  it("refuses a sixth account", async () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      addFake(`u${n}@gmail.com`, 100);
      await connect(`u${n}@gmail.com`);
    }

    expect(store.getState().index.accounts).toHaveLength(5);
    expect(errors()[0]).toMatch(/up to 5 accounts/);
  });

  it("will not remove an account that still holds files", async () => {
    addFake("a@gmail.com", 100);
    await connect("a@gmail.com");
    await upload("notes.txt", "hello");
    await store.removeAccount("a@gmail.com");

    expect(store.getState().index.accounts).toHaveLength(1);
    expect(errors()[0]).toMatch(/still holds/);
  });
});

describe("upload", () => {
  it("places a whole file in the first account by priority", async () => {
    addFake("a@gmail.com", 100);
    addFake("b@gmail.com", 100);
    await connect("a@gmail.com");
    await connect("b@gmail.com");

    const item = await upload("notes.txt", "hello", "/Sem 4");
    const record = fileNamed("notes.txt");

    expect(item.status).toBe("done");
    expect(record.location?.account).toBe("a@gmail.com");
    expect(record.folder).toBe("/Sem 4");
    expect(record.size).toBe(5);
    expect(fake("b@gmail.com").files.size).toBe(0);
  });

  it("spreads files with least-used routing", async () => {
    addFake("a@gmail.com", 100, 50);
    addFake("b@gmail.com", 100);
    await connect("a@gmail.com");
    await connect("b@gmail.com");
    store.setRouting("least-used");
    await upload("notes.txt", "hello");

    expect(fileNamed("notes.txt").location?.account).toBe("b@gmail.com");
  });

  it("skips a duplicate", async () => {
    addFake("a@gmail.com", 100);
    await connect("a@gmail.com");
    await upload("notes.txt", "hello");

    const item = await upload("copy.txt", "hello");

    expect(item.status).toBe("skipped");
    expect(store.getState().index.files).toHaveLength(1);
  });

  it("re-plans elsewhere when an account turns out to be full", async () => {
    addFake("a@gmail.com", 100).failUpload = new errorTypes.QuotaExceededError("a@gmail.com");
    addFake("b@gmail.com", 100);
    await connect("a@gmail.com");
    await connect("b@gmail.com");

    const item = await upload("notes.txt", "hello");

    expect(item.status).toBe("done");
    expect(fileNamed("notes.txt").location?.account).toBe("b@gmail.com");
  });

  it("fails clearly when there is no space", async () => {
    addFake("a@gmail.com", 3);
    await connect("a@gmail.com");

    const item = await upload("notes.txt", "hello");

    expect(item.status).toBe("failed");
    expect(item.message).toMatch(/short by 2 B/);
    expect(store.getState().index.files).toHaveLength(0);
  });

  it("pauses on an expired login and resumes after reconnecting", async () => {
    addFake("a@gmail.com", 100).failUpload = new errorTypes.AuthExpiredError("a@gmail.com");
    await connect("a@gmail.com");

    const item = await upload("notes.txt", "hello");

    expect(item.status).toBe("paused");
    expect(item.message).toBe("Waiting for a@gmail.com: reconnect it and this upload continues");
    expect(store.getState().runtime["a@gmail.com"].connected).toBe(false);

    await store.reconnectAccount("a@gmail.com");
    await settle();

    expect(store.getState().queue[0].status).toBe("done");
    expect(fileNamed("notes.txt").location?.account).toBe("a@gmail.com");
  });
});

describe("split files", () => {
  async function twoSmallAccounts() {
    addFake("a@gmail.com", 6);
    addFake("b@gmail.com", 6);
    await connect("a@gmail.com");
    await connect("b@gmail.com");
  }

  it("splits a file no single account fits and rejoins it on download", async () => {
    await twoSmallAccounts();

    const item = await upload("big.txt", "0123456789");
    const record = fileNamed("big.txt");

    expect(item.status).toBe("done");
    expect(record.location).toBeUndefined();
    expect(record.parts?.map((p) => [p.offset, p.bytes])).toEqual([[0, 6], [6, 4]]);
    expect(new Set(record.parts?.map((p) => p.account)).size).toBe(2);

    await store.downloadFile(record.id);

    expect(await world.saved?.text()).toBe("0123456789");
  });

  it("asks first and uploads nothing when the student says no", async () => {
    await twoSmallAccounts();
    confirmSplit = false;

    const item = await upload("big.txt", "0123456789");

    expect(item.status).toBe("failed");
    expect(fake("a@gmail.com").files.size + fake("b@gmail.com").files.size).toBe(0);
  });

  it("deletes the parts already sent when a later part fails", async () => {
    await twoSmallAccounts();
    fake("b@gmail.com").failUpload = new Error("boom");

    const item = await upload("big.txt", "0123456789");

    expect(item.status).toBe("failed");
    expect(fake("a@gmail.com").files.size).toBe(0);
    expect(store.getState().index.files).toHaveLength(0);
  });

  it("rejects a damaged part", async () => {
    await twoSmallAccounts();
    await upload("big.txt", "0123456789");

    const part = fileNamed("big.txt").parts![1];

    fake(part.account).files.set(part.fileId, new Blob(["XXXX"]));
    await store.downloadFile(fileNamed("big.txt").id);

    expect(world.saved).toBeNull();
    expect(errors()[0]).toMatch(/came back damaged/);
  });
});

describe("safe mode and download checks", () => {
  async function withCopy() {
    addFake("a@gmail.com", 100);
    addFake("b@gmail.com", 100);
    await connect("a@gmail.com");
    await connect("b@gmail.com");
    store.setSafeMode(true);
    await upload("notes.txt", "hello");

    return fileNamed("notes.txt");
  }

  it("stores a second copy in another account", async () => {
    const record = await withCopy();

    expect(record.location?.account).toBe("a@gmail.com");
    expect(record.copies?.map((c) => c.account)).toEqual(["b@gmail.com"]);
    expect(fake("b@gmail.com").files.size).toBe(1);
  });

  it("falls back to the safe copy when the main one is damaged", async () => {
    const record = await withCopy();

    fake("a@gmail.com").files.set(record.location!.fileId, new Blob(["HELLO"]));
    await store.downloadFile(record.id);

    expect(await world.saved?.text()).toBe("hello");
  });

  it("refuses a tampered file that has no copy", async () => {
    addFake("a@gmail.com", 100);
    await connect("a@gmail.com");
    await upload("notes.txt", "hello");

    const record = fileNamed("notes.txt");

    fake("a@gmail.com").files.set(record.location!.fileId, new Blob(["HELLO"]));
    await store.downloadFile(record.id);

    expect(world.saved).toBeNull();
    expect(errors()[0]).toBe('"notes.txt" came back damaged, try again.');
  });

  it("says so when no second account has room", async () => {
    addFake("a@gmail.com", 100);
    await connect("a@gmail.com");
    store.setSafeMode(true);

    const item = await upload("notes.txt", "hello");

    expect(item.status).toBe("done");
    expect(store.getState().notices.map((n) => n.text).join("\n")).toMatch(/without a safe-mode copy/);
  });
});

describe("trash and folders", () => {
  it("trashes, restores and permanently deletes every copy", async () => {
    addFake("a@gmail.com", 100);
    addFake("b@gmail.com", 100);
    await connect("a@gmail.com");
    await connect("b@gmail.com");
    store.setSafeMode(true);
    await upload("notes.txt", "hello");

    const { id } = fileNamed("notes.txt");

    await store.trashFile(id);
    expect(fileNamed("notes.txt").trashedAt).toBeTruthy();
    expect(fake("a@gmail.com").trashed.size).toBe(1);
    expect(fake("b@gmail.com").trashed.size).toBe(1);

    await store.restoreFile(id);
    expect(fileNamed("notes.txt").trashedAt).toBeUndefined();
    expect(fake("a@gmail.com").trashed.size).toBe(0);

    await store.trashFile(id);
    await store.emptyTrash();
    expect(store.getState().index.files).toHaveLength(0);
    expect(fake("a@gmail.com").files.size + fake("b@gmail.com").files.size).toBe(0);
  });

  it("moves a file by editing only the index", async () => {
    addFake("a@gmail.com", 100);
    await connect("a@gmail.com");
    await upload("notes.txt", "hello");
    store.createFolder("/", "Sem 4");
    store.moveFile(fileNamed("notes.txt").id, "/Sem 4");

    expect(fileNamed("notes.txt").folder).toBe("/Sem 4");
    expect(store.getState().index.folders).toEqual(["/Sem 4"]);
    expect(fake("a@gmail.com").files.size).toBe(1);

    store.deleteFolder("/Sem 4");
    expect(store.getState().index.folders).toEqual(["/Sem 4"]);
  });
});

describe("public PC mode", () => {
  it("saves nothing locally and forgets everything on logout", async () => {
    await store.chooseMode("public");
    addFake("a@gmail.com", 100);
    await connect("a@gmail.com");
    await upload("notes.txt", "hello");

    expect(world.local).toBeNull();
    expect(fake("a@gmail.com").index?.files).toHaveLength(1);

    store.logoutAll();

    expect(store.getState().index.files).toHaveLength(0);
    expect(store.getState().runtime).toEqual({});
  });
});

describe("undo, rename and folders", () => {
  async function oneAccount() {
    addFake("a@gmail.com", 1000);
    await connect("a@gmail.com");
  }

  it("offers undo after trashing, and undo restores", async () => {
    await oneAccount();
    await upload("notes.txt", "hello");

    const { id } = fileNamed("notes.txt");

    await store.trashFiles([id]);

    const notice = store.getState().notices.find((n) => n.action?.kind === "undo")!;

    expect(notice.text).toMatch(/moved to the trash/);

    store.runNoticeAction(notice.id);
    await vi.waitFor(() => expect(fileNamed("notes.txt").trashedAt).toBeUndefined());
    expect(fake("a@gmail.com").trashed.size).toBe(0);
  });

  it("keeps both files when a different one has the same name, and can replace", async () => {
    await oneAccount();
    await upload("notes.txt", "first");

    const item = await upload("notes.txt", "second");

    expect(item.status).toBe("done");
    expect(store.getState().index.files.map((f) => f.name).sort()).toEqual(["notes (2).txt", "notes.txt"]);

    await store.replaceOriginal(item.id);

    const live = store.getState().index.files.filter((f) => !f.trashedAt);

    expect(live.map((f) => f.name)).toEqual(["notes.txt"]);
    expect(live[0].id).toBe(item.fileId);
  });

  it("uploads a duplicate when asked to anyway", async () => {
    await oneAccount();
    await upload("notes.txt", "hello");

    const skipped = await upload("copy.txt", "hello");

    store.uploadAnyway(skipped.id);
    await settle();

    expect(store.getState().queue.find((i) => i.id === skipped.id)?.status).toBe("done");
    expect(store.getState().index.files).toHaveLength(2);
  });

  it("cancels an upload that has not started", async () => {
    await oneAccount();
    store.enqueue([new File(["a"], "a.txt"), new File(["b"], "b.txt")], "/");
    store.cancelUpload(store.getState().queue[1].id);
    await settle();

    expect(store.getState().queue.map((i) => i.status)).toEqual(["done", "cancelled"]);
    expect(store.getState().index.files.map((f) => f.name)).toEqual(["a.txt"]);
  });

  it("refuses a rename that clashes in the same folder", async () => {
    await oneAccount();
    await upload("a.txt", "a");
    await upload("b.txt", "b");
    await store.renameFile(fileNamed("b.txt").id, "a.txt");

    expect(fileNamed("b.txt")).toBeDefined();
    expect(errors().at(-1)).toMatch(/already has a file named/);

    await store.renameFile(fileNamed("b.txt").id, "c.txt");
    expect(fileNamed("c.txt")).toBeDefined();
  });

  it("renames a folder along with everything inside it", async () => {
    await oneAccount();
    await upload("notes.txt", "hello", "/Sem 4/DBMS");
    store.renameFolder("/Sem 4", "Semester 4");

    expect(fileNamed("notes.txt").folder).toBe("/Semester 4/DBMS");
    expect(store.foldersOf(store.getState().index)).toEqual(["/Semester 4", "/Semester 4/DBMS"]);
  });

  it("moves without clashing names", async () => {
    await oneAccount();
    await upload("notes.txt", "one", "/A");
    await upload("notes.txt", "two", "/B");

    const [a, b] = store.getState().index.files;

    store.moveFiles([b.id], "/A");

    expect(store.getState().index.files.find((f) => f.id === a.id)?.name).toBe("notes.txt");
    expect(store.getState().index.files.find((f) => f.id === b.id)?.name).toBe("notes (2).txt");
  });

  it("deletes a folder with its contents into the trash, and restoring brings it back", async () => {
    await oneAccount();
    await upload("notes.txt", "hello", "/Sem 4");
    await store.deleteFolder("/Sem 4", true);

    expect(fileNamed("notes.txt").trashedAt).toBeTruthy();
    expect(store.foldersOf(store.getState().index)).toEqual([]);

    await store.restoreFile(fileNamed("notes.txt").id);
    expect(store.foldersOf(store.getState().index)).toEqual(["/Sem 4"]);
  });

  it("purges trash older than the limit", async () => {
    await oneAccount();
    await upload("old.txt", "old");
    await upload("new.txt", "new");
    await store.trashFiles([fileNamed("old.txt").id, fileNamed("new.txt").id]);

    const later = Date.parse(fileNamed("old.txt").trashedAt!) + (store.TRASH_DAYS + 1) * 86_400_000;

    await store.purgeOldTrash(later);

    expect(store.getState().index.files).toHaveLength(0);
    expect(fake("a@gmail.com").files.size).toBe(0);
  });

  it("shows download progress and clears it afterwards", async () => {
    await oneAccount();
    await upload("notes.txt", "hello");

    const seen: number[] = [];
    const stop = store.subscribe(() => {
      const p = store.getState().progress[fileNamed("notes.txt").id];

      if (p !== undefined) seen.push(p);
    });

    await store.downloadFile(fileNamed("notes.txt").id);
    stop();

    expect(seen.length).toBeGreaterThan(0);
    expect(store.getState().progress).toEqual({});
    expect(await world.saved?.text()).toBe("hello");
  });

  it("shares and stops sharing the main copy", async () => {
    await oneAccount();
    await upload("notes.txt", "hello");

    const link = await store.shareFile(fileNamed("notes.txt").id);

    expect(link).toMatch(/^https:\/\/drive\.google\.com\/file\/d\//);
    expect(fileNamed("notes.txt").shareId).toBeTruthy();

    await store.unshareFile(fileNamed("notes.txt").id);
    expect(fileNamed("notes.txt").shareId).toBeUndefined();
  });
});

describe("sync between devices", () => {
  // A second browser on the same accounts: a fresh store, nothing cached.
  async function secondDevice(email: string) {
    world.local = null;
    vi.resetModules();

    const other: Store = await import("../lib/nebula-store");

    answerDialogs(other);
    await other.chooseMode("private");
    world.nextLogin = email;
    await other.connectAccount();

    return other;
  }

  it("merges changes made on two devices instead of dropping one", async () => {
    addFake("a@gmail.com", 1000);
    await connect("a@gmail.com");
    await upload("first.txt", "one");

    const laptop = store;
    const phone = await secondDevice("a@gmail.com");

    phone.enqueue([new File(["two"], "second.txt")], "/");
    await vi.waitFor(() => expect(phone.getState().queue[0]?.status).toMatch(/done|failed/));
    expect(phone.getState().queue[0].message).toBeUndefined();

    // Meanwhile the laptop renames the first file.
    await laptop.renameFile(laptop.getState().index.files[0].id, "renamed.txt");
    await laptop.syncNow();

    expect(laptop.getState().index.files.map((f) => f.name).sort()).toEqual(["renamed.txt", "second.txt"]);

    await phone.syncNow();
    expect(phone.getState().index.files.map((f) => f.name).sort()).toEqual(["renamed.txt", "second.txt"]);
  });

  it("keeps a delete from one device", async () => {
    addFake("a@gmail.com", 1000);
    await connect("a@gmail.com");
    await upload("gone.txt", "bye");

    const laptop = store;
    const phone = await secondDevice("a@gmail.com");

    await phone.deleteForever(phone.getState().index.files[0].id);
    await laptop.syncNow();

    expect(laptop.getState().index.files).toHaveLength(0);
  });
});

describe("saving", () => {
  it("batches quick successive changes into one write", async () => {
    addFake("a@gmail.com", 1000);
    await connect("a@gmail.com");
    // Let the saves from connecting finish before counting.
    await store.persist();

    let writes = 0;
    const write = fake("a@gmail.com").writeIndex;

    fake("a@gmail.com").writeIndex = async (index) => {
      writes++;

      return write(index);
    };

    store.createFolder("/", "A");
    store.createFolder("/", "B");
    store.createFolder("/", "C");
    await store.persist();

    expect(writes).toBe(1);
    expect(fake("a@gmail.com").index?.folders).toEqual(["/A", "/B", "/C"]);

    // Nothing changed: nothing written.
    await store.persist();
    expect(writes).toBe(1);
  });
});

describe("parallel uploads", () => {
  it("sends simultaneous uploads to different accounts", async () => {
    for (const email of ["a@gmail.com", "b@gmail.com"]) {
      const adapter = addFake(email, 1000);
      const upload = adapter.upload;

      // Slow enough that both uploads overlap.
      adapter.upload = async (...args) => {
        await new Promise((resolve) => setTimeout(resolve, 20));

        return upload(...args);
      };
      await connect(email);
    }

    store.enqueue([new File(["one"], "1.txt"), new File(["two"], "2.txt")], "/");
    await settle();

    const accounts = store.getState().index.files.map((f) => f.location?.account).sort();

    expect(accounts).toEqual(["a@gmail.com", "b@gmail.com"]);
  });

  it("takes back what was uploaded when cancelled during the safe-mode copy", async () => {
    addFake("a@gmail.com", 1000);
    const b = addFake("b@gmail.com", 1000);

    await connect("a@gmail.com");
    await connect("b@gmail.com");
    store.setSafeMode(true);

    b.upload = async () => {
      store.cancelUpload(store.getState().queue[0].id);
      throw "cancel";
    };

    const item = await upload("notes.txt", "hello");

    expect(item.status).toBe("cancelled");
    expect(fake("a@gmail.com").files.size).toBe(0);
    expect(store.getState().index.files).toHaveLength(0);
  });
});

describe("moving files off an account", () => {
  it("moves whole files, copies and split parts, then lets the account go", async () => {
    addFake("a@gmail.com", 6);
    addFake("b@gmail.com", 6);
    addFake("c@gmail.com", 100);
    await connect("a@gmail.com");
    await connect("b@gmail.com");
    await upload("small.txt", "abc");
    // Too big for any one of a and b: split across them.
    store.disconnectAccount("a@gmail.com");
    await store.reconnectAccount("a@gmail.com");
    store.setBuffer("a@gmail.com", 0);
    await upload("big.txt", "0123456");
    await connect("c@gmail.com");

    await store.moveOffAccount("a@gmail.com");

    expect(store.filesIn("a@gmail.com")).toHaveLength(0);
    expect(fake("a@gmail.com").files.size).toBe(0);

    await store.downloadFile(fileNamed("big.txt").id);
    expect(await world.saved?.text()).toBe("0123456");

    await store.removeAccount("a@gmail.com");
    expect(store.getState().index.accounts.map((a) => a.email)).not.toContain("a@gmail.com");
  });
});

describe("encryption", () => {
  it("stores ciphertext under a neutral name and gives the plain file back", async () => {
    addFake("a@gmail.com", 10_000);
    await connect("a@gmail.com");
    await store.setUpEncryption(world.passphrase);
    await upload("diary.txt", "dear diary");

    const record = fileNamed("diary.txt");
    const stored = [...fake("a@gmail.com").files.values()][0];

    expect(record.encrypted).toBe(true);
    expect(await stored.text()).not.toContain("dear diary");
    expect([...fake("a@gmail.com").names.values()][0]).toMatch(/^nebula-[0-9a-f]+\.bin$/);

    // A new session: the key is gone and the passphrase is asked for.
    store.lock();
    await store.downloadFile(record.id);
    expect(await world.saved?.text()).toBe("dear diary");
  });

  it("still finds duplicates of encrypted files", async () => {
    addFake("a@gmail.com", 10_000);
    await connect("a@gmail.com");
    await store.setUpEncryption(world.passphrase);
    await upload("a.txt", "same");

    expect((await upload("b.txt", "same")).status).toBe("skipped");
  });
});

describe("rename, undo, stars and links", () => {
  it("renames in Google Drive too", async () => {
    addFake("a@gmail.com", 1000);
    await connect("a@gmail.com");
    await upload("old.txt", "x");
    await store.renameFile(fileNamed("old.txt").id, "new.txt");

    await vi.waitFor(() => expect([...fake("a@gmail.com").names.values()]).toEqual(["new.txt"]));
  });

  it("undoes a move", async () => {
    addFake("a@gmail.com", 1000);
    await connect("a@gmail.com");
    await upload("notes.txt", "x");
    store.moveFiles([fileNamed("notes.txt").id], "/Elsewhere");

    const notice = store.getState().notices.findLast((n) => n.action?.kind === "undo")!;

    store.runNoticeAction(notice.id);
    expect(fileNamed("notes.txt").folder).toBe("/");
  });

  it("stars files", async () => {
    addFake("a@gmail.com", 1000);
    await connect("a@gmail.com");
    await upload("notes.txt", "x");
    store.setStarred([fileNamed("notes.txt").id], true);

    expect(fileNamed("notes.txt").starred).toBe(true);
  });

  it("revokes a share link once it expires", async () => {
    addFake("a@gmail.com", 1000);
    await connect("a@gmail.com");
    await upload("notes.txt", "x");
    await store.shareFile(fileNamed("notes.txt").id, 7);

    expect(fileNamed("notes.txt").shareExpires).toBeTruthy();

    await store.revokeExpiredShares(Date.now() + 8 * 86_400_000);
    expect(fileNamed("notes.txt").shareId).toBeUndefined();
  });

  it("refuses to share an encrypted file", async () => {
    addFake("a@gmail.com", 10_000);
    await connect("a@gmail.com");
    await store.setUpEncryption(world.passphrase);
    await upload("secret.txt", "x");

    expect(await store.shareFile(fileNamed("secret.txt").id)).toBeNull();
  });
});

describe("version checks", () => {
  it("downloads an account's file list only when its version moved", async () => {
    addFake("a@gmail.com", 1000);
    await connect("a@gmail.com");
    await store.persist();

    const before = fake("a@gmail.com").reads;

    // Changes made only here: the account's copy is the one this tab wrote.
    store.createFolder("/", "A");
    await store.persist();
    store.createFolder("/", "B");
    await store.persist();
    await store.syncNow();

    expect(fake("a@gmail.com").reads).toBe(before);

    // Another device writes: the next sync downloads it.
    const remote = fake("a@gmail.com");

    remote.index = { ...remote.index!, folders: [...remote.index!.folders, "/From phone"], updatedAt: new Date(Date.now() + 1000).toISOString(), foldersAt: { ...remote.index!.foldersAt, "/From phone": new Date(Date.now() + 1000).toISOString() } };
    remote.version++;
    await store.syncNow();

    expect(fake("a@gmail.com").reads).toBe(before + 1);
    expect(store.getState().index.folders).toContain("/From phone");
  });
});
