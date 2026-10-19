"use client";

import { useRef, useState, type DragEvent } from "react";
import { useNebula } from "@/context/NebulaContext";
import { folderName, ROOT } from "@/lib/folders";
import { formatBytes, formatDate } from "@/lib/format";
import { locationsOf } from "@/lib/index-store";
import type { FileRecord } from "@/lib/index-types";
import {
  askChoice,
  askText,
  cancelTransfer,
  downloadFile,
  driveLink,
  notify,
  renameFile,
  setStarred,
  shareFile,
  trashFiles,
  unshareFile,
} from "@/lib/nebula-store";
import { Icon } from "./Icon";
import { Menu, type MenuItem } from "./Menu";
import { canPreview } from "./Preview";
import { Thumb } from "./Thumb";

export const DRAG_TYPE = "application/x-nebula-files";

// Lets files be dropped on a folder or breadcrumb, and shows where they will land.
export function useDropTarget(folder: string, onDrop: (ids: string[], folder: string) => void) {
  const [over, setOver] = useState(false);

  const props = {
    onDragOver: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (event: DragEvent) => {
      setOver(false);

      const ids = event.dataTransfer.getData(DRAG_TYPE);

      if (ids) {
        event.preventDefault();
        event.stopPropagation();
        onDrop(JSON.parse(ids) as string[], folder);
      }
    },
  };

  return [props, over] as const;
}

// Google cannot expire "anyone" links; Nebula revokes them itself at its next run after the date.
async function share(file: FileRecord) {
  let days: number | undefined;

  if (!file.shareId) {
    const choice = await askChoice({
      title: `Share "${file.name}"?`,
      body:
        "Anyone with the link can view and download this file. An expiring link is " +
        "revoked the next time Nebula runs after that date.",
      choices: [
        { label: "Link for 7 days", value: "7" },
        { label: "Link for 1 day", value: "1" },
        { label: "Link for 30 days", value: "30" },
        { label: "Link with no expiry", value: "0" },
      ],
    });

    if (choice === null) return;

    days = Number(choice);
  }

  const link = await shareFile(file.id, days);

  if (!link) return;

  try {
    await navigator.clipboard.writeText(link);
    notify("success", "Share link copied.");
  } catch {
    await askText({ title: "Share link", label: "Copy this link", value: link, confirm: "Done" });
  }
}

export function FileItem({
  file,
  grid,
  selected,
  showFolder,
  onToggle,
  onOpen,
  onMove,
  onShowFolder,
  selection,
}: {
  file: FileRecord;
  grid: boolean;
  selected: boolean;
  showFolder: boolean;
  onToggle: (shift: boolean) => void;
  onOpen: () => void;
  onMove: () => void;
  onShowFolder: () => void;
  selection: string[];
}) {
  const { busy, progress } = useNebula();
  const accounts = [...new Set(locationsOf(file).map((l) => l.account))];
  const working = busy.includes(file.id);
  const fraction = progress[file.id];
  const link = driveLink(file);
  const viewable = canPreview(file);
  const press = useRef<number | null>(null);
  const pressed = useRef(false);

  // On touch screens a long press selects, since dragging is not available.
  const touch = {
    onPointerDown: (event: React.PointerEvent) => {
      if (event.pointerType !== "touch") return;

      pressed.current = false;
      press.current = window.setTimeout(() => {
        pressed.current = true;
        navigator.vibrate?.(10);
        onToggle(false);
      }, 500);
    },
    onPointerUp: () => window.clearTimeout(press.current ?? undefined),
    onPointerCancel: () => window.clearTimeout(press.current ?? undefined),
    onPointerMove: () => window.clearTimeout(press.current ?? undefined),
    // The click that ends a long press must not also open the file.
    onClickCapture: (event: React.MouseEvent) => {
      if (pressed.current) {
        pressed.current = false;
        event.preventDefault();
        event.stopPropagation();
      }
    },
    onContextMenu: (event: React.MouseEvent) => {
      if (press.current !== null && event.nativeEvent instanceof PointerEvent && event.nativeEvent.pointerType === "touch") {
        event.preventDefault();
      }
    },
  };

  const items: MenuItem[] = [
    ...(viewable ? [{ label: "Preview", icon: "eye" as const, onSelect: onOpen }] : []),
    { label: "Download", icon: "download", onSelect: () => downloadFile(file.id), disabled: working },
    {
      label: "Rename",
      icon: "rename",
      onSelect: async () => {
        const name = await askText({ title: "Rename file", label: "New name", value: file.name, confirm: "Rename" });

        if (name) void renameFile(file.id, name);
      },
    },
    { label: "Move to…", icon: "move", onSelect: onMove },
    {
      label: file.starred ? "Remove star" : "Star",
      icon: "star",
      onSelect: () => setStarred([file.id], !file.starred),
    },
    {
      label: file.shareId ? "Copy share link" : "Share link",
      icon: "link",
      onSelect: () => void share(file),
      disabled: !file.location || file.encrypted,
    },
    ...(file.shareId
      ? [{ label: "Stop sharing", icon: "close" as const, onSelect: () => void unshareFile(file.id) }]
      : []),
    ...(link
      ? [{ label: "Open in Google Drive", icon: "external" as const, onSelect: () => window.open(link, "_blank", "noopener,noreferrer") }]
      : []),
    { label: "Move to trash", icon: "trash", danger: true, onSelect: () => void trashFiles([file.id]), disabled: working },
  ];

  const meta = [
    formatBytes(file.size),
    formatDate(file.uploadedAt),
    accounts.join(", "),
    file.parts ? `split in ${file.parts.length}` : "",
    file.copies?.length ? "safe copy" : "",
    file.encrypted ? "encrypted" : "",
    file.shareId
      ? file.shareExpires
        ? `shared until ${formatDate(file.shareExpires)}`
        : "shared"
      : "",
  ].filter(Boolean).join(" · ");

  const checkbox = (
    <input
      type="checkbox"
      className="h-4 w-4 shrink-0 accent-accent"
      aria-label={`Select ${file.name}`}
      checked={selected}
      onChange={() => {}}
      onClick={(event) => onToggle(event.shiftKey)}
    />
  );

  const transfer = working && fraction !== undefined && (
    <span className="flex min-w-0 items-center gap-2 text-xs text-muted" aria-live="polite">
      <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded bg-track">
        <span className="block h-full bg-accent" style={{ width: `${fraction * 100}%` }} />
      </span>
      {fraction >= 0.99 ? "Checking…" : `${Math.round(fraction * 100)}%`}
      <button className="font-semibold text-foreground hover:underline" onClick={() => cancelTransfer(file.id)}>
        Cancel
      </button>
    </span>
  );

  const name = (
    <span className="flex min-w-0 items-center gap-1">
      <button
        className="min-w-0 truncate text-left font-medium hover:underline"
        title={file.name}
        onClick={viewable ? onOpen : () => downloadFile(file.id)}
      >
        {file.name}
      </button>
      <button
        className={`shrink-0 ${file.starred ? "text-amber-500" : "text-muted opacity-0 group-hover:opacity-100 focus:opacity-100"}`}
        aria-label={file.starred ? `Remove star from ${file.name}` : `Star ${file.name}`}
        aria-pressed={Boolean(file.starred)}
        onClick={() => setStarred([file.id], !file.starred)}
      >
        <Icon name="star" className="h-3.5 w-3.5" filled={file.starred} />
      </button>
    </span>
  );

  // In search results the folder leads the details line, so rows keep one height.
  const folder = showFolder && (
    <button className="flex shrink-0 items-center gap-1 font-medium text-foreground hover:underline"
      onClick={onShowFolder}>
      <Icon name="folder" className="h-3 w-3" />
      {file.folder === ROOT ? "My files" : file.folder.slice(1)}
      <span className="sr-only"> (open folder {folderName(file.folder) || "My files"})</span>
    </button>
  );

  const details = (text: string) =>
    transfer || (
      <span className="flex min-w-0 items-center gap-1.5 text-sm font-light text-muted">
        {folder}
        {folder && <span aria-hidden>·</span>}
        <span className="truncate">{text}</span>
      </span>
    );

  return (
    <li
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(selected ? selection : [file.id]));
      }}
      data-file-id={file.id}
      {...touch}
      className={`group relative flex overflow-hidden rounded-[16px] border border-border font-sans text-base ${
        grid ? "h-[176px] flex-col gap-2 p-2.5" : "h-14 items-center gap-3 px-3 md:gap-4"
      } ${selected ? "bg-lime/60" : "bg-paper"}`}
    >
      {grid ? (
        <>
          <div className="relative h-[96px] shrink-0 overflow-hidden rounded-[10px] border border-border/20">
            <button className="block h-full w-full" tabIndex={-1} aria-hidden onClick={viewable ? onOpen : undefined}>
              <Thumb file={file} large />
            </button>
            <div className="absolute left-1.5 top-1.5 rounded bg-card/90 p-1">{checkbox}</div>
          </div>
          <div className="flex min-w-0 items-start gap-1">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {name}
              {details(`${formatBytes(file.size)} · ${formatDate(file.uploadedAt)}`)}
            </div>
            <Menu label={`Actions for ${file.name}`} items={items} compact />
          </div>
        </>
      ) : (
        <>
          {checkbox}
          <Thumb file={file} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {name}
            {details(meta)}
          </div>
          <button
            className="btn btn-icon hidden h-9 w-9 sm:inline-flex"
            aria-label={`Download ${file.name}`}
            disabled={working}
            onClick={() => downloadFile(file.id)}
          >
            <Icon name="download" />
          </button>
          <Menu label={`Actions for ${file.name}`} items={items} compact />
        </>
      )}
    </li>
  );
}
