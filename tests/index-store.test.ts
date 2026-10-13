import { describe, expect, it } from "vitest";
import { createDefaultIndex } from "../lib/index-default";
import { locationsOf, newest, normalizeIndex, reconcile } from "../lib/index-store";
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
  it("lets the newest copy of the same index win, so deletes stay deleted", () => {
    const current = index("2026-10-02T00:00:00.000Z", ["a", "b"], [file("1", "a")]);
    const stale = index("2026-10-01T00:00:00.000Z", ["a", "b"], [
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

  it("merges two indexes that never shared an account", () => {
    const current = index("2026-10-02T00:00:00.000Z", ["x"], [file("1", "x")]);
    const other = index("2026-10-01T00:00:00.000Z", ["a", "b"], [file("2", "a")]);
    const merged = reconcile(current, other);

    expect(merged.files.map((f) => f.id)).toEqual(["1", "2"]);
    expect(merged.accounts.map((a) => a.email)).toEqual(["x", "a", "b"]);
    expect(new Set(merged.accounts.map((a) => a.priority)).size).toBe(3);
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
