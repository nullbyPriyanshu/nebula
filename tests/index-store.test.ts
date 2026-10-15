import { describe, expect, it } from "vitest";
import { createDefaultIndex } from "../lib/index-default";
import { locationsOf, merge, newest, normalizeIndex, reconcile, stamp } from "../lib/index-store";
import type { FileRecord, IndexFile } from "../lib/index-types";

const file = (id: string, account: string): FileRecord => ({
  id,
  name: `${id}.txt`,
  size: 1,
  type: "text/plain",
  uploadedAt: "2026-10-01T00:00:00.000Z",
  sha256: id,
  location: { account, fileId: `drive-${id}` },
  folder: "/",
});

// An index saved before deletions were recorded.
const legacy = (updatedAt: string, emails: string[], files: FileRecord[]): IndexFile => {
  const rest = index(updatedAt, emails, files);

  delete rest.deleted;
  delete rest.foldersAt;

  return rest;
};

const index = (updatedAt: string, emails: string[], files: FileRecord[]): IndexFile => ({
  ...createDefaultIndex(),
  updatedAt,
  accounts: emails.map((email, i) => ({
    email,
    priority: i + 1,
    buffer: 0,
    lastUsed: updatedAt,
  })),
  files,
});

describe("newest", () => {
  it("keeps the copy with the latest updatedAt and ignores missing ones", () => {
    const old = index("2026-10-01T00:00:00.000Z", ["a"], []);
    const fresh = index("2026-10-02T00:00:00.000Z", ["a"], []);

    expect(newest(old, null, fresh, undefined)).toBe(fresh);
    expect(newest(null)).toBeNull();
  });

  it("never prefers an untouched default index", () => {
    const saved = index("2026-10-01T00:00:00.000Z", ["a"], []);

    expect(newest(createDefaultIndex(), saved)).toBe(saved);
  });
});

describe("reconcile", () => {
  it("lets the newest copy of an old-style index win, so deletes stay deleted", () => {
    const current = legacy("2026-10-02T00:00:00.000Z", ["a", "b"], [file("1", "a")]);
    const stale = legacy("2026-10-01T00:00:00.000Z", ["a", "b"], [
      file("1", "a"),
      file("2", "b"),
    ]);

    expect(reconcile(current, stale)).toBe(current);
    expect(reconcile(stale, current)).toBe(current);
  });

  it("adopts a saved index over a fresh one", () => {
    const saved = index("2026-10-01T00:00:00.000Z", ["a"], [file("1", "a")]);

    expect(reconcile(createDefaultIndex(), saved)).toBe(saved);
    expect(reconcile(saved, null)).toBe(saved);
  });

  it("merges two old-style indexes that never shared an account", () => {
    const current = legacy("2026-10-02T00:00:00.000Z", ["x"], [file("1", "x")]);
    const other = legacy("2026-10-01T00:00:00.000Z", ["a", "b"], [file("2", "a")]);
    const merged = reconcile(current, other);

    expect(merged.files.map((f) => f.id)).toEqual(["1", "2"]);
    expect(merged.accounts.map((a) => a.email)).toEqual(["x", "a", "b"]);
    expect(new Set(merged.accounts.map((a) => a.priority)).size).toBe(3);
  });
});

describe("merge", () => {
  const T1 = "2026-10-01T00:00:00.000Z";
  const T2 = "2026-10-02T00:00:00.000Z";
  const T3 = "2026-10-03T00:00:00.000Z";
  const NOW = Date.parse("2026-10-04T00:00:00.000Z");

  it("keeps changes made on two devices to different files", () => {
    const base = index(T1, ["a"], [file("1", "a"), file("2", "a")]);
    const laptop = stamp(base, { ...base, files: [{ ...base.files[0], name: "renamed.txt" }, base.files[1]] }, T2);
    const phone = stamp(base, { ...base, files: [...base.files, file("3", "a")] }, T3);

    const merged = merge(laptop, phone, NOW);

    expect(merged.files.map((f) => f.id).sort()).toEqual(["1", "2", "3"]);
    expect(merged.files.find((f) => f.id === "1")?.name).toBe("renamed.txt");
    expect(reconcile(laptop, phone).files).toHaveLength(3);
  });

  it("keeps a delete from one device even though the other still lists the file", () => {
    const base = index(T1, ["a"], [file("1", "a"), file("2", "a")]);
    const laptop = stamp(base, { ...base, files: [base.files[0]] }, T2);
    const phone = stamp(base, { ...base, folders: ["/New"] }, T3);

    const merged = merge(laptop, phone, NOW);

    expect(merged.files.map((f) => f.id)).toEqual(["1"]);
    expect(merged.folders).toEqual(["/New"]);
  });

  it("takes the newer edit of the same file", () => {
    const base = index(T1, ["a"], [file("1", "a")]);
    const older = stamp(base, { ...base, files: [{ ...base.files[0], folder: "/Old" }] }, T2);
    const newer = stamp(base, { ...base, files: [{ ...base.files[0], folder: "/New" }] }, T3);

    expect(merge(newer, older, NOW).files[0].folder).toBe("/New");
    expect(merge(older, newer, NOW).files[0].folder).toBe("/New");
  });

  it("keeps a deleted folder deleted unless it was created again later", () => {
    const base = stamp(index(T1, ["a"], []), { ...index(T1, ["a"], []), folders: ["/A"] }, T1);
    const removed = stamp(base, { ...base, folders: [] }, T2);

    expect(merge(removed, base, NOW).folders).toEqual([]);

    const again = stamp(removed, { ...removed, folders: ["/A"] }, T3);

    expect(merge(again, removed, NOW).folders).toEqual(["/A"]);
  });

  it("takes the most recently changed settings", () => {
    const base = index(T1, ["a"], []);
    const changed = stamp(base, { ...base, settings: { ...base.settings, safeMode: true } }, T2);
    const other = stamp(base, { ...base, folders: ["/X"] }, T3);

    expect(merge(changed, other, NOW).settings.safeMode).toBe(true);
  });
});

describe("normalizeIndex", () => {
  it("rejects anything that is not an index", () => {
    expect(normalizeIndex(null)).toBeNull();
    expect(normalizeIndex({ version: 2 })).toBeNull();
    expect(normalizeIndex({ version: 1, updatedAt: "x", files: [] })).toBeNull();
  });

  it("fills in settings added after the index was saved", () => {
    const old = { ...createDefaultIndex(), settings: { routing: "least-used" } };

    expect(normalizeIndex(old)?.settings).toEqual({
      routing: "least-used",
      theme: "system",
      safeMode: false,
      encrypt: false,
    });
  });
});

describe("locationsOf", () => {
  it("lists the file, its split parts and its safe-mode copies", () => {
    const record: FileRecord = {
      ...file("1", "a"),
      parts: [{ account: "b", fileId: "p", offset: 0, bytes: 1, sha256: "h" }],
      copies: [{ account: "c", fileId: "c" }],
    };

    expect(locationsOf(record).map((l) => l.account)).toEqual(["a", "b", "c"]);
  });
});
