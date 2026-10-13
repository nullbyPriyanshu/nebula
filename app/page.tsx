"use client";

import Link from "next/link";
import { useRef, useState, type DragEvent } from "react";
import { SpaceRing } from "@/components/SpaceRing";
import { UploadQueue } from "@/components/UploadQueue";
import { useNebula } from "@/context/NebulaContext";
import { childFolders, crumbs, folderName, ROOT } from "@/lib/folders";
import { FILE_KINDS, fileKind, formatBytes, formatDate } from "@/lib/format";
import { locationsOf } from "@/lib/index-store";
import type { FileRecord } from "@/lib/index-types";
import {
  createFolder,
  deleteFolder,
  downloadFile,
  enqueue,
  foldersOf,
  moveFile,
  trashFile,
} from "@/lib/nebula-store";

const DRAG_TYPE = "application/x-nebula-file";

type Sort = "name" | "size" | "date";

const SORTS: Record<Sort, (a: FileRecord, b: FileRecord) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  size: (a, b) => b.size - a.size,
  date: (a, b) => b.uploadedAt.localeCompare(a.uploadedAt),
};

// Lets a file row be dropped on a folder or breadcrumb.
function dropTarget(folder: string) {
  return {
    onDragOver: (event: DragEvent) => {
      if (event.dataTransfer.types.includes(DRAG_TYPE)) event.preventDefault();
    },
    onDrop: (event: DragEvent) => {
      const id = event.dataTransfer.getData(DRAG_TYPE);

      if (id) {
        event.preventDefault();
        event.stopPropagation();
        moveFile(id, folder);
      }
    },
  };
}

function FileItem({
  file,
  folders,
  busy,
  grid,
}: {
  file: FileRecord;
  folders: string[];
  busy: boolean;
  grid: boolean;
}) {
  const accounts = [...new Set(locationsOf(file).map((l) => l.account))];

  return (
    <li
      draggable
      onDragStart={(event) => event.dataTransfer.setData(DRAG_TYPE, file.id)}
      className={`card flex gap-2 p-3 text-sm ${
        grid ? "flex-col" : "flex-wrap items-center justify-between"
      }`}
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{file.name}</p>
        <p className="truncate text-xs text-muted">
          {formatBytes(file.size)} · {formatDate(file.uploadedAt)} ·{" "}
          {accounts.join(", ")}
          {file.parts && ` · split in ${file.parts.length}`}
          {file.copies?.length ? " · safe copy" : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="field max-w-36"
          aria-label={`Move ${file.name} to folder`}
          value={file.folder}
          onChange={(event) => moveFile(file.id, event.target.value)}
        >
          {[ROOT, ...folders].map((folder) => (
            <option key={folder} value={folder}>
              {folder === ROOT ? "/ (top)" : folder}
            </option>
          ))}
        </select>
        <button className="btn" disabled={busy} onClick={() => downloadFile(file.id)}>
          {busy ? "Working…" : "Download"}
        </button>
        <button className="btn btn-danger" disabled={busy} onClick={() => trashFile(file.id)}>
          Trash
        </button>
      </div>
    </li>
  );
}

export default function MyFilesPage() {
  const { index, runtime, busy } = useNebula();

  const [path, setPath] = useState(ROOT);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [account, setAccount] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [grid, setGrid] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const connected = index.accounts.filter((a) => runtime[a.email]?.connected);
  const total = connected.reduce((sum, a) => sum + runtime[a.email].total, 0);
  const used = connected.reduce((sum, a) => sum + runtime[a.email].used, 0);

  const folders = foldersOf(index);
  // The folder may have been deleted while it was open.
  const here = path === ROOT || folders.includes(path) ? path : ROOT;
  const searching = Boolean(query || kind || account);

  // Search and filters look in every folder; otherwise show the current one.
  const files = index.files
    .filter((file) => !file.trashedAt)
    .filter((file) => (searching ? true : file.folder === here))
    .filter((file) => file.name.toLowerCase().includes(query.toLowerCase()))
    .filter((file) => !kind || fileKind(file.type, file.name) === kind)
    .filter(
      (file) => !account || locationsOf(file).some((l) => l.account === account),
    )
    .sort(SORTS[sort]);

  const subfolders = searching ? [] : childFolders(folders, here);

  const upload = (list: FileList | null) => {
    if (list?.length) enqueue([...list], here);
  };

  return (
    <div
      className="space-y-4"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        if (event.dataTransfer.files.length) {
          event.preventDefault();
          upload(event.dataTransfer.files);
        }
      }}
    >
      <section className="card flex flex-wrap items-center justify-between gap-4">
        {connected.length > 0 ? (
          <SpaceRing used={used} total={total} />
        ) : (
          <p className="text-sm text-muted">
            {index.accounts.length > 0
              ? "Reconnect an account to upload or download."
              : "Connect a Google account to start."}{" "}
            <Link href="/accounts/" className="text-accent underline">
              Go to Accounts
            </Link>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              upload(event.target.files);
              event.target.value = "";
            }}
          />
          <button
            className="btn btn-primary"
            disabled={connected.length === 0}
            onClick={() => picker.current?.click()}
          >
            Upload files
          </button>
          <button
            className="btn"
            onClick={() => {
              const name = window.prompt("Folder name");

              if (name) createFolder(here, name);
            }}
          >
            New folder
          </button>
        </div>
      </section>

      <UploadQueue />

      <section className="flex flex-wrap gap-2">
        <input
          type="search"
          placeholder="Search all files"
          className="field min-w-0 flex-1"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select className="field" aria-label="File type" value={kind}
          onChange={(event) => setKind(event.target.value)}>
          <option value="">All types</option>
          {FILE_KINDS.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
        <select className="field max-w-40" aria-label="Account" value={account}
          onChange={(event) => setAccount(event.target.value)}>
          <option value="">All accounts</option>
          {index.accounts.map((a) => (
            <option key={a.email} value={a.email}>{a.email}</option>
          ))}
        </select>
        <select className="field" aria-label="Sort by" value={sort}
          onChange={(event) => setSort(event.target.value as Sort)}>
          <option value="name">Name</option>
          <option value="size">Largest</option>
          <option value="date">Newest</option>
        </select>
        <button className="btn" onClick={() => setGrid(!grid)}>
          {grid ? "List" : "Grid"}
        </button>
      </section>

      {!searching && (
        <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Folder path">
          {crumbs(here).map((crumb, i) => (
            <span key={crumb} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted">/</span>}
              <button
                className={`rounded px-1 ${crumb === here ? "font-semibold" : "text-accent"}`}
                onClick={() => setPath(crumb)}
                {...dropTarget(crumb)}
              >
                {crumb === ROOT ? "My files" : folderName(crumb)}
              </button>
            </span>
          ))}
        </nav>
      )}

      <ul className={grid ? "grid grid-cols-2 gap-2 sm:grid-cols-3" : "space-y-2"}>
        {subfolders.map((folder) => (
          <li key={folder} className="card flex items-center justify-between gap-2 p-3 text-sm"
            {...dropTarget(folder)}>
            <button className="min-w-0 truncate text-left font-medium"
              onClick={() => setPath(folder)}>
              📁 {folderName(folder)}
            </button>
            <button className="btn btn-danger shrink-0" onClick={() => deleteFolder(folder)}>
              Delete
            </button>
          </li>
        ))}
        {files.map((file) => (
          <FileItem key={file.id} file={file} folders={folders}
            busy={busy.includes(file.id)} grid={grid} />
        ))}
      </ul>

      {files.length === 0 && subfolders.length === 0 && (
        <p className="py-8 text-center text-sm text-muted">
          {searching
            ? "No files match."
            : "Nothing here yet. Upload files or drop them on this page."}
        </p>
      )}
    </div>
  );
}
