"use client";

import { useEffect } from "react";
import { useNebula } from "@/context/NebulaContext";
import { dismissNotice, runNoticeAction, type Notice } from "@/lib/nebula-store";
import { Icon } from "./Icon";

const actionLabel = (action: NonNullable<Notice["action"]>) =>
  action.kind === "undo" ? "Undo" : (action.label ?? "Reconnect");

// Errors stay until dismissed; everything else fades out.
const LIFETIME = { info: 6000, success: 5000 } as const;

function Toast({ notice }: { notice: Notice }) {
  const error = notice.kind === "error";
  const stays = error || Boolean(notice.sticky);

  useEffect(() => {
    if (stays) return;

    const ms = LIFETIME[notice.kind as "info" | "success"] + (notice.action ? 4000 : 0);
    const timer = window.setTimeout(() => dismissNotice(notice.id), ms);

    return () => window.clearTimeout(timer);
  }, [stays, notice.id, notice.kind, notice.action]);

  return (
    <div
      role={error ? "alert" : "status"}
      className={`card pointer-events-auto flex items-start gap-3 py-2.5 text-sm shadow-lg ${
        error ? "border-danger" : ""
      }`}
    >
      <span className={`min-w-0 flex-1 break-words ${error ? "text-danger" : ""}`}>
        {notice.text}
      </span>
      {notice.action && (
        <button
          className="shrink-0 font-semibold text-accent hover:underline"
          onClick={() => runNoticeAction(notice.id)}
        >
          {actionLabel(notice.action)}
        </button>
      )}
      <button
        className="shrink-0 text-muted hover:text-foreground"
        aria-label="Dismiss"
        onClick={() => dismissNotice(notice.id)}
      >
        <Icon name="close" />
      </button>
    </div>
  );
}

export function Toasts() {
  const { notices } = useNebula();

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-40 ml-auto flex max-w-sm flex-col gap-2 sm:left-auto">
      {notices.map((notice) => (
        <Toast key={notice.id} notice={notice} />
      ))}
    </div>
  );
}
