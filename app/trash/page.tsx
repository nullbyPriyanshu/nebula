"use client";

import { useNebula } from "@/context/NebulaContext";
import { formatBytes, formatDate } from "@/lib/format";
import { deleteForever, emptyTrash, restoreFile } from "@/lib/nebula-store";

export default function TrashPage() {
  const { index, busy } = useNebula();

  const files = index.files.filter((file) => file.trashedAt);
  // Safe-mode copies take space too.
  const held = files.reduce(
    (sum, file) => sum + file.size * (1 + (file.copies?.length ?? 0)),
    0,
  );

  return (
    <div className="space-y-4">
      <section className="card flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          Trashed files still count against each account. Emptying the trash
          frees <strong>{formatBytes(held)}</strong>.
        </p>
        <button
          className="btn btn-danger"
          disabled={files.length === 0}
          onClick={() => {
            if (window.confirm("Permanently delete everything in the trash?")) {
              void emptyTrash();
            }
          }}
        >
          Empty trash
        </button>
      </section>

      <ul className="space-y-2">
        {files.map((file) => (
          <li key={file.id}
            className="card flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{file.name}</p>
              <p className="text-xs text-muted">
                {formatBytes(file.size)} · trashed {formatDate(file.trashedAt!)} ·
                from {file.folder}
              </p>
            </div>
            <div className="flex gap-2">
              <button className="btn" disabled={busy.includes(file.id)}
                onClick={() => restoreFile(file.id)}>
                Restore
              </button>
              <button
                className="btn btn-danger"
                disabled={busy.includes(file.id)}
                onClick={() => {
                  if (window.confirm(`Permanently delete "${file.name}"?`)) {
                    void deleteForever(file.id);
                  }
                }}
              >
                Delete forever
              </button>
            </div>
          </li>
        ))}
      </ul>

      {files.length === 0 && (
        <p className="py-8 text-center text-sm text-muted">The trash is empty.</p>
      )}
    </div>
  );
}
