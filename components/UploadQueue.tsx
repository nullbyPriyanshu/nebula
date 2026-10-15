"use client";

import Link from "next/link";
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

export function UploadQueue() {
  const { queue, index } = useNebula();

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

  return (
    <section data-reveal className="card space-y-4" aria-label="Uploads">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="card-title">Uploads</h2>
          <p className="font-sans text-sm text-muted" aria-live="polite">
            {done} of {counted.length} done · {formatBytes(sent)} of {formatBytes(total)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {busy > 0 && <button className="btn" onClick={pauseAll}>Pause all</button>}
          {pausedByUser && <button className="btn" onClick={resumeAll}>Resume all</button>}
          {(busy > 0 || pausedByUser) && (
            <button className="btn" onClick={cancelAll}>Cancel all</button>
          )}
          {finished && <button className="btn" onClick={clearFinished}>Clear finished</button>}
        </div>
      </div>
      {total > 0 && (
        <div className="h-1.5 overflow-hidden rounded bg-track">
          <div className="h-full bg-accent" style={{ width: `${(sent / total) * 100}%` }} />
        </div>
      )}
      <ul className="max-h-80 space-y-3 overflow-y-auto">
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
    </section>
  );
}
