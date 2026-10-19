"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useNebula } from "@/context/NebulaContext";
import { formatBytes } from "@/lib/format";
import { normalizePath } from "@/lib/folders";
import {
  cancelAll,
  cancelUpload,
  clearFinished,
  pauseAll,
  pauseUpload,
  reconnectAccount,
  replaceOriginal,
  resumeAll,
  resumeUpload,
  retryUpload,
  uploadAnyway,
  type UploadItem,
} from "@/lib/nebula-store";
import { Icon } from "./Icon";

const ACTIVE = ["waiting", "hashing", "uploading"];

function duration(seconds: number) {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;

  return `${(seconds / 3600).toFixed(1)} h`;
}

function statusText(item: UploadItem): string {
  switch (item.status) {
    case "waiting":
      return "Waiting";
    case "hashing":
      return "Checking file…";
    case "uploading": {
      const parts = [item.message ?? `Uploading ${Math.round(item.progress * 100)}%`];

      if (item.target) parts.push(`to ${item.target}`);

      if (item.speed) {
        const left = (item.size * (1 - item.progress)) / item.speed;

        parts.push(`${formatBytes(item.speed)}/s`, `${duration(left)} left`);
      }

      return parts.join(" · ");
    }
    case "done":
      return item.message ?? "Done";
    case "paused":
      return item.message ?? "Paused";
    case "cancelled":
      return "Cancelled";
    default:
      return item.message ?? item.status;
  }
}

function Row({ item, duplicatePath }: { item: UploadItem; duplicatePath?: string }) {
  const { index } = useNebula();
  const active = ACTIVE.includes(item.status);
  const email = item.status === "paused" ? item.waitingFor : undefined;
  const tone =
    item.status === "failed"
      ? "text-danger"
      : item.status === "done"
        ? "text-foreground"
        : "text-muted";

  return (
    <li className="font-sans text-base">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate">
          {item.name} <span className="text-muted">({formatBytes(item.size)})</span>
        </span>
        <div className="flex shrink-0 gap-1">
          {item.status === "failed" && (
            <button className="btn" onClick={() => retryUpload(item.id)}>Retry</button>
          )}
          {item.status === "skipped" && (
            <button className="btn" onClick={() => uploadAnyway(item.id)}>Upload anyway</button>
          )}
          {item.status === "done" && item.sameNameAs && index.files.some((f) => f.id === item.sameNameAs) && (
            <button className="btn" onClick={() => replaceOriginal(item.id)}>Replace the older one</button>
          )}
          {email && (
            <button className="btn btn-primary" onClick={() => reconnectAccount(email)}>Reconnect</button>
          )}
          {item.status === "paused" && item.pausedBy === "user" && (
            <button className="btn btn-icon" aria-label={`Resume ${item.name}`}
              onClick={() => resumeUpload(item.id)}>
              <Icon name="play" />
            </button>
          )}
          {active && (
            <button className="btn btn-icon" aria-label={`Pause ${item.name}`}
              onClick={() => pauseUpload(item.id)}>
              <Icon name="pause" />
            </button>
          )}
          {(active || item.status === "paused") && (
            <button className="btn btn-icon" aria-label={`Cancel ${item.name}`}
              onClick={() => cancelUpload(item.id)}>
              <Icon name="close" />
            </button>
          )}
        </div>
      </div>
      <p className={tone}>
        {statusText(item)}
        {duplicatePath && (
          <>
            {" "}
            <Link className="text-accent underline" href={`/files/?path=${encodeURIComponent(duplicatePath)}`}>
              Show it
            </Link>
          </>
        )}
      </p>
      {(item.status === "uploading" || item.status === "paused") && item.progress > 0 && (
        <div className="mt-1 h-1.5 overflow-hidden rounded bg-track">
          <div
            className={`h-full ${item.status === "paused" ? "bg-muted" : "bg-accent"}`}
            style={{ width: `${Math.round(item.progress * 100)}%` }}
          />
        </div>
      )}
    </li>
  );
}

// A dock in the corner, on every app page, like a cloud drive's upload panel.
// It folds down to one progress line and clears itself away when emptied.
export function UploadQueue() {
  const { queue, index } = useNebula();
  const [open, setOpen] = useState(true);

  // Once everything finished cleanly, the dock steps out of the way by itself.
  // Anything that needs a decision (a failure, a duplicate, a name clash) keeps it.
  const settled =
    queue.length > 0 &&
    queue.every((item) => item.status === "done" || item.status === "cancelled") &&
    !queue.some((item) => item.sameNameAs);

  useEffect(() => {
    if (!settled) return;

    const timer = window.setTimeout(clearFinished, 4000);

    return () => window.clearTimeout(timer);
  }, [settled]);

  if (queue.length === 0) {
    return null;
  }

  // Overall progress over everything not cancelled or skipped.
  const counted = queue.filter((item) => !["cancelled", "skipped"].includes(item.status));
  const total = counted.reduce((sum, item) => sum + item.size, 0);
  const sent = counted.reduce(
    (sum, item) => sum + item.size * (item.status === "done" ? 1 : item.progress),
    0,
  );
  const busy = queue.filter((item) => ACTIVE.includes(item.status)).length;
  const pausedByUser = queue.some((item) => item.status === "paused" && item.pausedBy === "user");
  const finished = queue.some((item) => ["done", "failed", "skipped", "cancelled"].includes(item.status));
  const done = queue.filter((item) => item.status === "done").length;
  const failed = queue.filter((item) => item.status === "failed").length;

  const heading = busy > 0
    ? `Uploading ${busy} file${busy === 1 ? "" : "s"}`
    : failed > 0
      ? `${failed} upload${failed === 1 ? "" : "s"} need attention`
      : `${done} upload${done === 1 ? "" : "s"} done`;

  return (
    <section
      aria-label="Uploads"
      className="fixed bottom-4 right-4 z-40 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-[20px] border border-border bg-card shadow-[5px_5px_0_0_var(--border)]"
    >
      <div className="flex items-center gap-3 border-b border-border bg-lime px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-sans text-base font-semibold">{heading}</h2>
          <p className="font-mono text-xs text-ink/70" aria-live="polite">
            {done}/{counted.length} · {formatBytes(sent)} of {formatBytes(total)}
          </p>
        </div>
        <button className="btn btn-icon h-9 w-9" aria-label={open ? "Fold uploads" : "Show uploads"}
          aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name={open ? "down" : "up"} />
        </button>
        {!busy && !pausedByUser && (
          <button className="btn btn-icon h-9 w-9" aria-label="Close uploads" onClick={clearFinished}>
            <Icon name="close" />
          </button>
        )}
      </div>
      {total > 0 && (
        <div className="h-1 bg-track">
          <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${(sent / total) * 100}%` }} />
        </div>
      )}
      {open && (
        <>
          <ul className="max-h-[min(320px,45vh)] space-y-3 overflow-y-auto px-4 py-3">
            {queue.map((item) => {
              const duplicate = item.duplicateOf
                ? index.files.find((file) => file.id === item.duplicateOf)
                : undefined;

              return (
                <Row
                  key={item.id}
                  item={item}
                  duplicatePath={duplicate ? normalizePath(duplicate.folder) : undefined}
                />
              );
            })}
          </ul>
          {(busy > 0 || pausedByUser || finished) && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
              {busy > 0 && <button className="btn h-9" onClick={pauseAll}>Pause all</button>}
              {pausedByUser && <button className="btn h-9" onClick={resumeAll}>Resume all</button>}
              {(busy > 0 || pausedByUser) && <button className="btn h-9" onClick={cancelAll}>Cancel all</button>}
              {finished && <button className="btn h-9" onClick={clearFinished}>Clear finished</button>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
