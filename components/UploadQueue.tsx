"use client";

import { useNebula } from "@/context/NebulaContext";
import { formatBytes } from "@/lib/format";
import { clearFinished, retryUpload, type UploadItem } from "@/lib/nebula-store";

function statusText(item: UploadItem): string {
  switch (item.status) {
    case "waiting":
      return "Waiting";
    case "hashing":
      return "Checking file…";
    case "uploading":
      return item.message ?? `Uploading ${Math.round(item.progress * 100)}%`;
    case "done":
      return "Done";
    default:
      return item.message ?? item.status;
  }
}

export function UploadQueue() {
  const { queue } = useNebula();

  if (queue.length === 0) {
    return null;
  }

  return (
    <section className="card space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Uploads</h2>
        <button className="btn" onClick={clearFinished}>
          Clear finished
        </button>
      </div>
      <ul className="space-y-2">
        {queue.map((item) => (
          <li key={item.id} className="text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">
                {item.name}{" "}
                <span className="text-muted">({formatBytes(item.size)})</span>
              </span>
              {item.status === "failed" && (
                <button className="btn shrink-0" onClick={() => retryUpload(item.id)}>
                  Retry
                </button>
              )}
            </div>
            <p
              className={
                item.status === "failed" || item.status === "paused"
                  ? "text-danger"
                  : "text-muted"
              }
            >
              {statusText(item)}
            </p>
            {item.status === "uploading" && (
              <div className="mt-1 h-1.5 overflow-hidden rounded bg-border">
                <div
                  className="h-full bg-accent"
                  style={{ width: `${Math.round(item.progress * 100)}%` }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
