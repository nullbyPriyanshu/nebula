import { describe, expect, it } from "vitest";
import { spaceByAccount, spaceByKind, uploadsPerWeek } from "../lib/analytics";
import {
  allFolders,
  childFolders,
  crumbs,
  isInside,
  joinPath,
  normalizePath,
  parentOf,
} from "../lib/folders";
import { fileKind, formatBytes } from "../lib/format";
import { sha256 } from "../lib/hash";
import type { FileRecord } from "../lib/index-types";
import { partName, splitLayout } from "../lib/split";

describe("split", () => {
  it("lays parts end to end", () => {
    expect(splitLayout([{ id: "b", bytes: 8 }, { id: "a", bytes: 2 }])).toEqual([
      { id: "b", offset: 0, bytes: 8 },
      { id: "a", offset: 8, bytes: 2 },
    ]);
  });

  it("names parts", () => {
    expect(partName("video.mp4", 2, 3)).toBe("video.mp4.part2of3");
  });
});

describe("sha256", () => {
  it("matches the known digest of 'abc'", async () => {
    expect(await sha256(new Blob(["abc"]))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("hashes an empty file", async () => {
    expect(await sha256(new Blob([]))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("joined parts hash the same as the whole", async () => {
    const whole = new Blob(["hello ", "nebula"]);
    const parts = [whole.slice(0, 5), whole.slice(5)];

    expect(await sha256(new Blob(parts))).toBe(await sha256(whole));
  });
});

describe("folders", () => {
  it("normalizes and joins paths", () => {
    expect(normalizePath("Sem 4//DBMS/")).toBe("/Sem 4/DBMS");
    expect(normalizePath("")).toBe("/");
    expect(joinPath("/Sem 4", "a/b")).toBe("/Sem 4/a b");
    expect(parentOf("/Sem 4/DBMS")).toBe("/Sem 4");
    expect(parentOf("/Sem 4")).toBe("/");
  });

  it("builds breadcrumbs", () => {
    expect(crumbs("/Sem 4/DBMS")).toEqual(["/", "/Sem 4", "/Sem 4/DBMS"]);
    expect(crumbs("/")).toEqual(["/"]);
  });

  it("lists folders with their ancestors and direct children", () => {
    const folders = allFolders(["/Sem 4/DBMS", "/Notes", "/"]);

    expect(folders).toEqual(["/Notes", "/Sem 4", "/Sem 4/DBMS"]);
    expect(childFolders(folders, "/")).toEqual(["/Notes", "/Sem 4"]);
    expect(childFolders(folders, "/Sem 4")).toEqual(["/Sem 4/DBMS"]);
  });

  it("knows what is inside a folder", () => {
    expect(isInside("/Sem 4/DBMS", "/Sem 4")).toBe(true);
    expect(isInside("/Sem 4", "/Sem 4")).toBe(true);
    expect(isInside("/Sem 40", "/Sem 4")).toBe(false);
  });
});

describe("format", () => {
  it("formats sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(15 * 1024 ** 3)).toBe("15.0 GB");
  });

  it("groups files by kind", () => {
    expect(fileKind("image/png", "a.png")).toBe("image");
    expect(fileKind("", "notes.pdf")).toBe("document");
    expect(fileKind("", "backup.zip")).toBe("archive");
    expect(fileKind("", "mystery")).toBe("other");
  });
});

describe("analytics", () => {
  const files: FileRecord[] = [
    {
      id: "1", name: "a.png", size: 10, type: "image/png", sha256: "",
      uploadedAt: "2026-10-12T10:00:00", folder: "/",
      location: { account: "a", fileId: "1" },
      copies: [{ account: "b", fileId: "2" }],
    },
    {
      id: "2", name: "b.pdf", size: 6, type: "application/pdf", sha256: "",
      uploadedAt: "2026-10-01T10:00:00", folder: "/",
      parts: [
        { account: "a", fileId: "3", offset: 0, bytes: 4, sha256: "" },
        { account: "b", fileId: "4", offset: 4, bytes: 2, sha256: "" },
      ],
    },
  ];

  it("counts parts and copies per account", () => {
    expect(spaceByAccount(files)).toEqual([
      { label: "a", value: 14 },
      { label: "b", value: 12 },
    ]);
  });

  it("sums space by kind", () => {
    expect(spaceByKind(files)).toEqual([
      { label: "image", value: 10 },
      { label: "document", value: 6 },
    ]);
  });

  it("lists the largest files and the growth per month", async () => {
    const { growthByMonth, largestFiles } = await import("../lib/analytics");

    expect(largestFiles(files, 1)).toEqual([{ label: "a.png", value: 10 }]);

    const growth = growthByMonth(files, new Date("2026-10-13T12:00:00").getTime(), 2);

    expect(growth.map((month) => month.value)).toEqual([0, 16]);
  });

  it("counts uploads in Monday-based weeks", () => {
    const now = new Date("2026-10-13T12:00:00").getTime();
    const weeks = uploadsPerWeek(files, now, 3);

    expect(weeks.map((week) => week.value)).toEqual([1, 0, 1]);
  });
});

describe("search", async () => {
  const { matches } = await import("../lib/search");
  const record = (name: string, folder = "/") => ({
    id: name,
    name,
    folder,
    size: 1,
    type: "",
    uploadedAt: "",
    sha256: "",
  });

  it("matches every word, in any order, in the name or folder, ignoring accents and case", () => {
    expect(matches(record("Résumé 2026.pdf", "/Jobs"), "resume jobs")).toBe(true);
    expect(matches(record("Résumé 2026.pdf", "/Jobs"), "2026 RESUME")).toBe(true);
    expect(matches(record("Résumé 2026.pdf", "/Jobs"), "resume 2025")).toBe(false);
    expect(matches(record("notes.txt"), "  ")).toBe(true);
  });
});
