"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Thumb } from "@/components/Thumb";
import { useNebula } from "@/context/NebulaContext";
import { ROOT } from "@/lib/folders";
import { formatBytes, formatDate } from "@/lib/format";
import {
  TRASH_DAYS,
  ask,
  daysLeft,
  deleteForeverMany,
  emptyTrash,
  restoreFiles,
} from "@/lib/nebula-store";
import { AppPage } from "@/components/site/AppPage";
import { Stat, StatRow } from "@/components/site/Stat";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function TrashPage() {
  const { index, busy } = useNebula();
  const [selection, setSelection] = useState<string[]>([]);
  // Read the clock once, in the browser only.
  const [now] = useState(() => Date.now());

  const files = index.files
    .filter((file) => file.trashedAt)
    .sort((a, b) => b.trashedAt!.localeCompare(a.trashedAt!));
  const selected = selection.filter((id) => files.some((file) => file.id === id));
  const allSelected = files.length > 0 && selected.length === files.length;

  // Safe-mode copies take space too.
  const held = files.reduce(
    (sum, file) => sum + file.size * (1 + (file.copies?.length ?? 0)),
    0,
  );

  const confirmDelete = (ids: string[]) =>
    ask({
      title: ids.length === files.length ? "Empty the trash?" : `Delete ${plural(ids.length, "file")} for good?`,
      body: "They are removed from every Google account they are stored in. This cannot be undone.",
      confirm: "Delete for good",
      danger: true,
    });

  return (
    <AppPage
      tag="Trash"
      title="Trash"
      lead={`Trashed files still count against each account. They are deleted for good ${TRASH_DAYS} days after they were trashed.`}
      actions={
        <button
          className="l-btn l-btn-plain"
          disabled={files.length === 0}
          onClick={async () => {
            if (await confirmDelete(files.map((file) => file.id))) void emptyTrash();
          }}
        >
          <Icon name="trash" className="h-5 w-5" /> Empty trash
        </button>
      }
    >
      <div data-reveal>
        <StatRow>
          <Stat value={files.length} label="in the trash" />
          <Stat value={formatBytes(held)} label="to free" note="counting safe copies" />
          <Stat value={`${TRASH_DAYS} days`} label="kept" note="then deleted for good" />
          <Stat value={files.filter((file) => daysLeft(file, now) <= 3).length} label="due soon" note="in 3 days or less" />
        </StatRow>
      </div>

      <section data-reveal aria-label="Trashed files list" className="space-y-4 rounded-[34px] border border-border bg-card p-6 max-md:rounded-[24px] max-md:p-3">

      {files.length > 0 && (
        <div className={`flex flex-wrap items-center gap-2 text-sm ${selected.length > 0 ? "card sticky top-2 z-20 p-2 shadow-md" : ""}`}>
          <label className="flex items-center gap-2 px-1">
            <input
              type="checkbox"
              className="h-4 w-4 accent-accent"
              checked={allSelected}
              ref={(element) => {
                if (element) element.indeterminate = selected.length > 0 && !allSelected;
              }}
              onChange={() => setSelection(allSelected ? [] : files.map((file) => file.id))}
            />
            {selected.length > 0 ? `${selected.length} selected` : "Select all"}
          </label>
          {selected.length > 0 && (
            <div className="ml-auto flex flex-wrap gap-2">
              <button className="btn" onClick={() => {
                void restoreFiles(selected);
                setSelection([]);
              }}>
                <Icon name="restore" /> Restore
              </button>
              <button className="btn btn-danger" onClick={async () => {
                if (await confirmDelete(selected)) {
                  void deleteForeverMany(selected);
                  setSelection([]);
                }
              }}>
                <Icon name="trash" /> Delete for good
              </button>
            </div>
          )}
        </div>
      )}

      <ul className="space-y-2" aria-label="Trashed files">
        {files.map((file) => {
          const working = busy.includes(file.id);
          const left = daysLeft(file, now);

          return (
            <li key={file.id}
              className={`card flex items-center gap-3 p-3 text-sm ${selected.includes(file.id) ? "border-accent ring-1 ring-accent" : ""}`}>
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 accent-accent"
                aria-label={`Select ${file.name}`}
                checked={selected.includes(file.id)}
                onChange={() =>
                  setSelection(
                    selected.includes(file.id)
                      ? selected.filter((id) => id !== file.id)
                      : [...selected, file.id],
                  )
                }
              />
              <Thumb file={file} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{file.name}</p>
                <p className="truncate text-xs text-muted">
                  {formatBytes(file.size)} · trashed {formatDate(file.trashedAt!)} · from{" "}
                  {file.folder === ROOT ? "My files" : file.folder} ·{" "}
                  <span className={left <= 3 ? "text-danger" : ""}>
                    {left === 0 ? "deleted at next sign-in" : `deleted in ${plural(left, "day")}`}
                  </span>
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button className="btn" disabled={working} aria-label={`Restore ${file.name}`}
                  onClick={() => restoreFiles([file.id])}>
                  <Icon name="restore" />
                  <span className="hidden sm:inline">Restore</span>
                </button>
                <button
                  className="btn btn-danger"
                  disabled={working}
                  aria-label={`Delete ${file.name} for good`}
                  onClick={async () => {
                    if (await confirmDelete([file.id])) void deleteForeverMany([file.id]);
                  }}
                >
                  <Icon name="trash" />
                  <span className="hidden sm:inline">Delete forever</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {files.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <p className="card-title">The trash is empty</p>
          <p className="font-sans text-base font-light text-muted">Files you trash wait here for {TRASH_DAYS} days.</p>
        </div>
      )}
      </section>
    </AppPage>
  );
}
