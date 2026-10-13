import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IndexFile } from "../lib/index-types";
import type { DriveAdapter } from "../lib/storage/adapter";

// In-memory stand-ins for Google, the login popup and IndexedDB.
type Fake = DriveAdapter & {
  files: Map<string, Blob>;
  trashed: Set<string>;
  index: IndexFile | null;
  total: number;
  used: number;
  failUpload?: Error;
};

const world = vi.hoisted(() => ({
  fakes: new Map<string, unknown>(),
  nextLogin: "",
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
    trashed: new Set(),
    index: null,
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
    readIndex: async () => adapter.index,
    writeIndex: async (index) => {
      adapter.index = index;
    },
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

  vi.stubGlobal("window", { confirm: () => confirmSplit });
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
    expect(item.message).toBe("Reconnect a@gmail.com to continue");
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
    expect(store.getState().notices[0].text).toMatch(/without a safe-mode copy/);
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
