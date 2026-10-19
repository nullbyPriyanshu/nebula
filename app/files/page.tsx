"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, Suspense, useEffect, useRef, useState } from "react";
import { FileItem, useDropTarget } from "@/components/FileItem";
import { GetStarted } from "@/components/GetStarted";
import { Icon } from "@/components/Icon";
import { Menu } from "@/components/Menu";
import { MoveDialog } from "@/components/MoveDialog";
import { Pager } from "@/components/Pager";
import { Select } from "@/components/Select";
import { Preview } from "@/components/Preview";
import { SpaceRing } from "@/components/SpaceRing";
import { useNebula } from "@/context/NebulaContext";
import { entriesFromDrop, entriesFromPicker } from "@/lib/drop";
import { childFolders, crumbs, folderName, normalizePath, ROOT } from "@/lib/folders";
import { FILE_KINDS, fileKind, formatBytes } from "@/lib/format";
import { locationsOf } from "@/lib/index-store";
import type { FileRecord } from "@/lib/index-types";
import { openedAt } from "@/lib/recent";
import { matches, rememberSearch, searchHistory } from "@/lib/search";
import {
  ask,
  askText,
  createFolder,
  deleteFolder,
  downloadFiles,
  enqueue,
  enqueueEntries,
  filesInside,
  foldersOf,
  moveFiles,
  renameFolder,
  trashFiles,
} from "@/lib/nebula-store";
import { AppPage } from "@/components/site/AppPage";
import { Stat, StatRow } from "@/components/site/Stat";

type Sort = "name" | "size" | "date";

// Quick views across every folder.
type Show = "" | "starred" | "recent" | "shared";

const SHOWS: { value: Show; label: string }[] = [
  { value: "", label: "All files" },
  { value: "starred", label: "Starred" },
  { value: "recent", label: "Recent" },
  { value: "shared", label: "Shared" },
];

// "Recent": uploaded or opened on this device in the last 30 days.
const RECENT_MS = 30 * 24 * 60 * 60 * 1000;

const lastTouched = (file: FileRecord) => {
  const opened = openedAt(file.id);

  return opened && opened > file.uploadedAt ? opened : file.uploadedAt;
};

// Fixed sizes of a list row and a grid tile, so pages can be fitted exactly.
const ROW = 56;
const TILE = 176;
const TILE_MIN = 180;
const GAP = 8;

const SORTS: Record<Sort, (a: FileRecord, b: FileRecord) => number> = {
  name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }),
  size: (a, b) => b.size - a.size,
  date: (a, b) => b.uploadedAt.localeCompare(a.uploadedAt),
};

const SHORTCUTS = [
  "/  Search",
  "Ctrl/⌘ + A  Select every file shown",
  "Delete  Move the selected files to the trash",
  "M  Move the selected files",
  "Esc  Clear the selection",
  "← →  Previous / next page",
  "← →  In the preview: previous / next file",
  "?  This list",
].join("\n");

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

function FolderItem({
  folder,
  count,
  onOpen,
  grid,
}: {
  folder: string;
  count: number;
  onOpen: () => void;
  grid: boolean;
}) {
  const [drop, over] = useDropTarget(folder, moveFiles);
  const name = folderName(folder);

  return (
    <li
      {...drop}
      className={`flex overflow-hidden rounded-[16px] border border-border font-sans text-base ${
        grid ? "h-[176px] flex-col justify-between p-4" : "h-14 items-center gap-3 px-3 md:gap-4"
      } ${over ? "bg-lime" : "bg-paper"}`}
    >
      <span className={`flex shrink-0 items-center justify-center rounded-[10px] border border-border bg-lavender text-ink ${grid ? "h-16 w-16" : "h-10 w-10"}`}>
        <Icon name="folder" className={grid ? "h-8 w-8" : "h-5 w-5"} />
      </span>
      <button className="flex min-w-0 flex-1 flex-col justify-end text-left" onClick={onOpen}>
        <span className="truncate font-semibold">{name}</span>
        <span className="text-sm font-light text-muted">
          {over ? "Drop to move here" : count === 0 ? "Empty folder" : `${count} file${count === 1 ? "" : "s"}`}
        </span>
      </button>
      <Menu
        compact
        label={`Actions for folder ${name}`}
        items={[
          { label: "Open", icon: "folder", onSelect: onOpen },
          {
            label: "Rename",
            icon: "rename",
            onSelect: async () => {
              const next = await askText({ title: "Rename folder", label: "New name", value: name, confirm: "Rename" });

              if (next) renameFolder(folder, next);
            },
          },
          {
            label: "Delete",
            icon: "trash",
            danger: true,
            onSelect: async () => {
              const ok = await ask(
                count === 0
                  ? { title: `Delete "${name}"?`, body: "The folder is empty.", confirm: "Delete", danger: true }
                  : {
                      title: `Delete "${name}" and its contents?`,
                      body: `The ${count} file${count === 1 ? "" : "s"} inside move to the trash, where you can restore them for 30 days. Restoring a file brings its folder back.`,
                      confirm: "Move contents to trash",
                      danger: true,
                    },
              );

              if (ok) void deleteFolder(folder, true);
            },
          },
        ]}
      />
    </li>
  );
}

function Crumb({ crumb, here, onOpen }: { crumb: string; here: string; onOpen: () => void }) {
  const [drop, over] = useDropTarget(crumb, moveFiles);

  return (
    <button
      {...drop}
      aria-current={crumb === here ? "page" : undefined}
      className={`rounded px-1 ${crumb === here ? "font-semibold" : "text-accent hover:underline"} ${
        over ? "bg-accent text-accent-foreground" : ""
      }`}
      onClick={onOpen}
    >
      {crumb === ROOT ? "My files" : folderName(crumb)}
    </button>
  );
}

function Files() {
  const { index, runtime, mode } = useNebula();
  const params = useSearchParams();

  // Folder, search, filters, sort and view live in the URL, so refresh, Back and links keep them.
  const path = normalizePath(params.get("path") ?? ROOT);
  // What is typed lives here and is copied to the URL. Reading it back from the
  // URL would race Next's asynchronous URL updates and drop fast keystrokes.
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const kind = params.get("type") ?? "";
  const account = params.get("account") ?? "";
  const sort = (params.get("sort") as Sort) in SORTS ? (params.get("sort") as Sort) : "name";
  const grid = params.get("view") === "grid";
  const show = (SHOWS.some((s) => s.value === params.get("show")) ? params.get("show") : "") as Show;

  const setParams = (patch: Record<string, string>, push = false) => {
    const next = new URLSearchParams(params.toString());

    for (const [key, value] of Object.entries(patch)) {
      if (value && !(key === "path" && value === ROOT)) next.set(key, value);
      else next.delete(key);
    }

    const search = next.toString();

    window.history[push ? "pushState" : "replaceState"](null, "", search ? `?${search}` : "/files/");
  };

  // Public PC mode saves nothing on the computer, search history included.
  const remember = (text: string) => {
    if (mode === "private") rememberSearch(text);
  };

  const changeQuery = (text: string) => {
    setQuery(text);
    setParams({ q: text });
  };

  // Back and Forward bring back the search that was in the URL then.
  useEffect(() => {
    const restore = () => setQuery(new URLSearchParams(window.location.search).get("q") ?? "");

    window.addEventListener("popstate", restore);

    return () => window.removeEventListener("popstate", restore);
  }, []);

  const openFolder = (folder: string) => {
    setQuery("");
    setParams({ path: folder, q: "", type: "", account: "", show: "" }, true);
  };

  const [selection, setSelection] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [moving, setMoving] = useState<string[] | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [dragging, setDragging] = useState(0);

  const picker = useRef<HTMLInputElement>(null);
  const folderPicker = useRef<HTMLInputElement>(null);
  const search = useRef<HTMLInputElement>(null);

  const connected = index.accounts.filter((a) => runtime[a.email]?.connected);
  const total = connected.reduce((sum, a) => sum + runtime[a.email].total, 0);
  const used = connected.reduce((sum, a) => sum + runtime[a.email].used, 0);
  const canUpload = connected.length > 0;

  const trashed = index.files.filter((file) => file.trashedAt);
  const trashBytes = trashed.reduce((sum, file) => sum + file.size * (1 + (file.copies?.length ?? 0)), 0);

  const folders = foldersOf(index);
  // The folder may have been deleted while it was open.
  const here = path === ROOT || folders.includes(path) ? path : ROOT;
  const searching = Boolean(query || kind || account || show);
  // Captured once per render: Date.now() must not run during render itself.
  const [now] = useState(() => Date.now());

  // Search, filters and quick views look in every folder; otherwise show the current one.
  const files = index.files
    .filter((file) => !file.trashedAt)
    .filter((file) => (searching ? true : file.folder === here))
    .filter((file) => matches(file, query))
    .filter((file) => !kind || fileKind(file.type, file.name) === kind)
    .filter((file) => !account || locationsOf(file).some((l) => l.account === account))
    .filter((file) =>
      show === "starred"
        ? file.starred
        : show === "shared"
          ? file.shareId
          : show === "recent"
            ? Date.parse(lastTouched(file)) > now - RECENT_MS
            : true,
    )
    .sort(
      show === "recent" && !params.get("sort")
        ? (a, b) => lastTouched(b).localeCompare(lastTouched(a))
        : SORTS[sort],
    );

  const subfolders = searching ? [] : childFolders(folders, here);
  const live = index.files.filter((file) => !file.trashedAt);

  // Files per folder, counting everything below it, in one pass.
  const counts = new Map<string, number>();

  for (const file of index.files) {
    if (file.trashedAt) continue;

    for (const crumb of crumbs(file.folder)) counts.set(crumb, (counts.get(crumb) ?? 0) + 1);
  }

  // Only what is on screen can stay selected.
  const onScreen = new Set(files.map((file) => file.id));
  const selected = selection.filter((id) => onScreen.has(id));
  const selectedSet = new Set(selected);

  // One page at a time, as many rows (or tiles) as fit the panel, so neither
  // the page nor the list scrolls. A new list starts again at its first page.
  const listKey = `${here}|${query}|${kind}|${account}|${show}|${sort}`;
  const listBox = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ cols: 1, rows: 10 });
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    const element = listBox.current;

    if (!element) return;

    const measure = () => {
      const wide = window.matchMedia("(min-width: 1024px)").matches;
      // The box minus its 12px padding on each side.
      const width = element.clientWidth - 24;
      const height = element.clientHeight - 24;
      const cols = grid ? Math.max(2, Math.floor((width + GAP) / (TILE_MIN + GAP))) : 1;
      const rows = wide
        ? Math.max(1, Math.floor((height + GAP) / ((grid ? TILE : ROW) + GAP)))
        : grid ? 4 : 12;

      setFit((now) => (now.cols === cols && now.rows === rows ? now : { cols, rows }));
    };

    measure();

    const observer = new ResizeObserver(measure);

    observer.observe(element);

    return () => observer.disconnect();
  }, [grid]);

  const perPage = fit.cols * fit.rows;
  const itemCount = subfolders.length + files.length;
  const pages = Math.max(1, Math.ceil(itemCount / perPage));
  const [paging, setPaging] = useState({ key: listKey, page: 0 });
  const page = Math.min(paging.key === listKey ? paging.page : 0, pages - 1);
  const goTo = (next: number) => setPaging({ key: listKey, page: Math.max(0, Math.min(pages - 1, next)) });

  // Folders come first, then files, split across the pages in that order.
  const from = page * perPage;
  const pageFolders = subfolders.slice(from, from + perPage);
  const pageFiles = files.slice(Math.max(0, from - subfolders.length), from + perPage - subfolders.length);
  const columns = { gridTemplateColumns: `repeat(${fit.cols}, minmax(0, 1fr))` };
  const allSelected = files.length > 0 && selected.length === files.length;

  const toggle = (id: string, shift: boolean) => {
    if (shift && anchor) {
      const ids = files.map((file) => file.id);
      const [a, b] = [ids.indexOf(anchor), ids.indexOf(id)].sort((x, y) => x - y);

      if (a >= 0) {
        setSelection([...new Set([...selected, ...ids.slice(a, b + 1)])]);

        return;
      }
    }

    setAnchor(id);
    setSelection(selected.includes(id) ? selected.filter((other) => other !== id) : [...selected, id]);
  };

  const newFolder = async () => {
    const name = await askText({
      title: "New folder",
      label: `Inside ${here === ROOT ? "My files" : folderName(here)}`,
      confirm: "Create",
    });

    if (name) createFolder(here, name);
  };

  // Keyboard shortcuts for the file list; dialogs and text fields keep their keys.
  const keys = useRef<(event: KeyboardEvent) => void>(() => {});

  useEffect(() => {
    keys.current = (event) => {
      if (typing(event.target) || document.querySelector("dialog[open]")) return;

      const mod = event.ctrlKey || event.metaKey;

      if (event.key === "/") {
        event.preventDefault();
        search.current?.focus();
      } else if (mod && event.key.toLowerCase() === "a" && files.length > 0) {
        event.preventDefault();
        setSelection(files.map((file) => file.id));
      } else if (event.key === "Escape" && selected.length > 0) {
        setSelection([]);
      } else if ((event.key === "Delete" || event.key === "Backspace") && selected.length > 0) {
        event.preventDefault();
        void trashFiles(selected);
        setSelection([]);
      } else if (event.key.toLowerCase() === "m" && !mod && selected.length > 0) {
        setMoving(selected);
      } else if ((event.key === "ArrowRight" || event.key === "ArrowLeft") && !mod) {
        goTo(page + (event.key === "ArrowRight" ? 1 : -1));
      } else if (event.key === "?") {
        void ask({ title: "Keyboard shortcuts", body: SHORTCUTS, confirm: "Got it", cancel: "Close" });
      }
    };
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => keys.current(event);

    window.addEventListener("keydown", listener);

    return () => window.removeEventListener("keydown", listener);
  }, []);

  const dropFiles = (event: React.DragEvent) => event.dataTransfer.types.includes("Files");

  return (
    <div
      className="relative flex flex-col lg:min-h-0 lg:flex-1"
      onDragEnter={(event) => {
        if (dropFiles(event)) setDragging((n) => n + 1);
      }}
      onDragLeave={(event) => {
        if (dropFiles(event)) setDragging((n) => Math.max(0, n - 1));
      }}
      onDragOver={(event) => {
        if (dropFiles(event)) event.preventDefault();
      }}
      onDrop={(event) => {
        setDragging(0);

        if (!dropFiles(event)) return;

        event.preventDefault();

        if (!canUpload) return;

        // Read the entries now: the DataTransfer empties after this handler.
        void entriesFromDrop(event.dataTransfer, here).then(enqueueEntries);
      }}
    >
      {dragging > 0 && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-accent/15 p-6">
          <div className="rounded-xl border-2 border-dashed border-accent bg-card px-8 py-6 text-center shadow-xl">
            <Icon name="upload" className="mx-auto h-8 w-8 text-accent" />
            <p className="mt-2 font-semibold">
              {canUpload
                ? `Drop to upload to ${here === ROOT ? "My files" : folderName(here)}`
                : "Reconnect an account to upload"}
            </p>
            {canUpload && <p className="text-sm text-muted">Folders keep their structure.</p>}
          </div>
        </div>
      )}

      <input ref={picker} type="file" multiple hidden
        onChange={(event) => {
          if (event.target.files?.length) enqueue([...event.target.files], here);
          event.target.value = "";
        }}
      />
      <input ref={folderPicker} type="file" multiple hidden {...{ webkitdirectory: "" }}
        onChange={(event) => {
          if (event.target.files?.length) enqueueEntries(entriesFromPicker(event.target.files, here));
          event.target.value = "";
        }}
      />

      <AppPage
        tag="My files"
        title="Your space"
        lead="Every file across your accounts, in one place. Drop files or whole folders anywhere on this page."
        art="/art/peek.svg"
        actions={
          <>
            <button className="l-btn l-btn-lime" disabled={!canUpload} onClick={() => picker.current?.click()}>
              <Icon name="upload" className="h-5 w-5" /> Upload files
            </button>
            <button className="l-btn l-btn-plain" disabled={!canUpload} onClick={() => folderPicker.current?.click()}>
              <Icon name="folder" className="h-5 w-5" /> Upload folder
            </button>
            <button className="l-btn l-btn-plain" onClick={newFolder}>
              <Icon name="plus" className="h-5 w-5" /> New folder
            </button>
          </>
        }
      >

      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[300px_1fr] lg:grid-rows-[minmax(0,1fr)]">
      <aside aria-label="Overview" className="flex flex-col gap-5 lg:min-h-0 lg:overflow-hidden">
        {index.accounts.length > 0 && (
          <div className="card">
            {connected.length > 0 ? (
              <div className="space-y-3">
                <SpaceRing used={used} total={total} compact />
                {trashed.length > 0 && (
                  <p className="font-sans text-sm text-muted">
                    {formatBytes(trashBytes)} of that is in the trash.{" "}
                    <Link href="/trash/" className="font-semibold text-foreground underline underline-offset-4">Empty it</Link> to free the space.
                  </p>
                )}
              </div>
            ) : (
              <p className="font-sans text-base text-muted">Reconnect an account above to upload or download.</p>
            )}
          </div>
        )}
        <StatRow compact>
          <Stat value={live.length} label="files" />
          <Stat value={folders.length} label="folders" />
          <Stat value={`${connected.length}/${index.accounts.length}`} label="connected" />
          <Stat value={index.files.filter((f) => f.starred && !f.trashedAt).length} label="starred" />
        </StatRow>
        <div className="card hidden space-y-2 bg-paper lg:block [@media(max-height:960px)]:lg:hidden">
          <h2 className="font-sans text-base font-semibold">Shortcuts</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 font-sans text-sm font-light text-muted">
            {[["/", "Search"], ["← →", "Previous / next page"], ["M", "Move selected"], ["Del", "Trash selected"], ["?", "All shortcuts"]].map(([key, what]) => (
              <Fragment key={key}>
                <dt><kbd className="rounded border border-border bg-card px-1.5 font-mono text-xs text-foreground">{key}</kbd></dt>
                <dd>{what}</dd>
              </Fragment>
            ))}
          </dl>
        </div>
      </aside>

      <section aria-label="Files and folders" className="flex flex-col overflow-hidden rounded-[24px] border border-border bg-card lg:min-h-0">
        {/* Row 1: views, search and filters. */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
          <nav className="flex gap-0.5 overflow-x-auto" aria-label="Views">
            {SHOWS.map((option) => (
              <button
                key={option.value}
                aria-current={show === option.value ? "page" : undefined}
                className={`h-10 shrink-0 rounded-full px-3.5 font-sans text-sm font-medium transition-colors ${
                  show === option.value ? "bg-ink text-white" : "text-muted hover:text-foreground"
                }`}
                onClick={() => setParams({ show: option.value, path: option.value ? "" : here }, true)}
              >
                {option.label}
              </button>
            ))}
          </nav>
          <section className="flex min-w-[200px] flex-1" aria-label="Search">
            <input
              ref={search}
              type="search"
              placeholder="Search all files  ( / )"
              aria-label="Search all files"
              className="field h-10 w-full"
              value={query}
              list="search-history"
              onFocus={() => setHistory(searchHistory())}
              onChange={(event) => changeQuery(event.target.value)}
              onBlur={() => remember(query)}
              onKeyDown={(event) => {
                if (event.key === "Enter") remember(query);
                if (event.key === "Escape") changeQuery("");
              }}
            />
            <datalist id="search-history">
              {history.map((q) => (
                <option key={q} value={q} />
              ))}
            </datalist>
          </section>
          <div className="flex gap-2">
            <button className="btn btn-icon h-10 w-10" aria-label={grid ? "Show as list" : "Show as grid"}
              aria-pressed={grid} onClick={() => setParams({ view: grid ? "" : "grid" })}>
              <Icon name={grid ? "list" : "grid"} />
            </button>
            <button className="btn btn-icon h-10 w-10" aria-label="Keyboard shortcuts"
              onClick={() => void ask({ title: "Keyboard shortcuts", body: SHORTCUTS, confirm: "Got it", cancel: "Close" })}>
              <Icon name="keyboard" />
            </button>
          </div>
        </div>

        {/* Row 2: where you are, and what is selected. */}
        <div className={`flex min-h-[52px] shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-2 font-sans text-base transition-colors ${
          selected.length > 0 ? "bg-lime" : ""
        }`}>
          {files.length > 0 && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-accent"
                aria-label="Select all"
                checked={allSelected}
                ref={(element) => {
                  if (element) element.indeterminate = selected.length > 0 && !allSelected;
                }}
                onChange={() => setSelection(allSelected ? [] : files.map((file) => file.id))}
              />
              {selected.length > 0 && <span className="font-semibold">{selected.length} selected</span>}
            </label>
          )}
          {selected.length > 0 ? (
            <div className="ml-auto flex flex-wrap gap-2">
              <button className="btn h-9" onClick={() => void downloadFiles(selected)}>
                <Icon name="download" /> Download
              </button>
              <button className="btn h-9" onClick={() => setMoving(selected)}>
                <Icon name="move" /> Move
              </button>
              <button className="btn btn-danger h-9" onClick={() => {
                void trashFiles(selected);
                setSelection([]);
              }}>
                <Icon name="trash" /> Trash
              </button>
              <button className="btn btn-icon h-9 w-9" aria-label="Clear selection" onClick={() => setSelection([])}>
                <Icon name="close" />
              </button>
            </div>
          ) : searching ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
              <p aria-live="polite">
                {files.length} {show && !query && !kind && !account
                  ? `${SHOWS.find((s) => s.value === show)!.label.toLowerCase()} file${files.length === 1 ? "" : "s"}`
                  : `match${files.length === 1 ? "" : "es"}`}{" "}
                in every folder
              </p>
              <button className="font-semibold underline underline-offset-4"
                onClick={() => {
                  setQuery("");
                  setParams({ q: "", type: "", account: "", show: "" });
                }}>
                {show && !query && !kind && !account ? "Back to folders" : "Clear search"}
              </button>
            </div>
          ) : (
            <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1" aria-label="Folder path">
              {crumbs(here).map((crumb, i) => (
                <span key={crumb} className="flex items-center gap-1">
                  {i > 0 && <span className="text-muted" aria-hidden>/</span>}
                  <Crumb crumb={crumb} here={here} onOpen={() => openFolder(crumb)} />
                </span>
              ))}
            </nav>
          )}
          {selected.length === 0 && (
            <section className="ml-auto flex flex-wrap gap-2" aria-label="Filters">
            <Select
              label="File type"
              className="h-9 w-[124px]"
              value={kind}
              onChange={(value) => setParams({ type: value })}
              options={[
                { value: "", label: "All types" },
                ...FILE_KINDS.map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) })),
              ]}
            />
            <Select
              label="Account"
              className="h-9 w-[150px]"
              value={account}
              onChange={(value) => setParams({ account: value })}
              options={[
                { value: "", label: "All accounts" },
                ...index.accounts.map((a) => ({ value: a.email, label: a.email })),
              ]}
            />
            <Select<Sort>
              label="Sort by"
              className="h-9 w-[116px]"
              value={sort}
              onChange={(value) => setParams({ sort: value === "name" ? "" : value })}
              options={[
                { value: "name", label: "Name" },
                { value: "size", label: "Largest" },
                { value: "date", label: "Newest" },
              ]}
            />
            </section>
          )}
        </div>

        <div ref={listBox} className="flex flex-col gap-2 p-3 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
      {pageFolders.length > 0 && (
        <ul className="grid gap-2" style={columns} aria-label="Folders">
          {pageFolders.map((folder) => (
            <FolderItem
              key={folder}
              folder={folder}
              grid={grid}
              count={counts.get(folder) ?? 0}
              onOpen={() => openFolder(folder)}
            />
          ))}
        </ul>
      )}

      {pageFiles.length > 0 && (
        <ul className="grid gap-2" style={columns} aria-label="Files">
          {pageFiles.map((file) => (
            <FileItem
              key={file.id}
              file={file}
              grid={grid}
              selected={selectedSet.has(file.id)}
              selection={selected}
              showFolder={searching}
              onToggle={(shift) => toggle(file.id, shift)}
              onOpen={() => setPreviewing(file.id)}
              onMove={() => setMoving([file.id])}
              onShowFolder={() => openFolder(file.folder)}
            />
          ))}
        </ul>
      )}

      {files.length === 0 && subfolders.length === 0 && !searching && here === ROOT && index.files.length === 0 ? (
        <GetStarted onUpload={() => picker.current?.click()} />
      ) : files.length === 0 && subfolders.length === 0 && (
        <div className="m-auto py-4 text-center font-sans text-base font-light text-muted">
          {searching ? (
            <p>
              {show === "starred"
                ? "No starred files. Star a file from its ⋯ menu to find it here."
                : show === "shared"
                  ? "Nothing is shared by link."
                  : show === "recent"
                    ? "Nothing uploaded or opened in the last 30 days."
                    : "No files match. Try fewer filters."}
            </p>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG illustration */}
              <img src="/art/hero.svg" alt="" className="mx-auto mb-2 h-32 w-auto" />
              <p className="font-semibold text-foreground">{here === ROOT ? "Nothing here yet" : "This folder is empty"}</p>
              <p>Drop files or folders anywhere on this page, or use Upload files.</p>
              {here !== ROOT && filesInside(here).length === 0 && (
                <button className="mt-3 text-accent hover:underline"
                  onClick={async () => {
                    if (await ask({ title: `Delete "${folderName(here)}"?`, body: "The folder is empty.", confirm: "Delete", danger: true })) {
                      void deleteFolder(here);
                    }
                  }}>
                  Delete this empty folder
                </button>
              )}
            </>
          )}
        </div>
      )}
        </div>
        {pages > 1 && (
          <Pager page={page} pages={pages} from={from + 1} to={Math.min(itemCount, from + perPage)} total={itemCount} onGo={goTo} />
        )}
      </section>
      </div>
      </AppPage>

      {moving && (
        <MoveDialog
          ids={moving}
          from={here}
          onClose={() => {
            setMoving(null);
            setSelection([]);
          }}
        />
      )}

      {previewing && (
        <Preview files={files} start={previewing} onClose={() => setPreviewing(null)} />
      )}
    </div>
  );
}

export default function MyFilesPage() {
  // useSearchParams needs a Suspense boundary for the static export.
  return (
    <Suspense fallback={<div className="skeleton h-40" />}>
      <Files />
    </Suspense>
  );
}
