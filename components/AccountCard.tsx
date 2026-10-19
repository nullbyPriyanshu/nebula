"use client";

import Link from "next/link";
import { useState, type DragEvent } from "react";
import { formatBytes } from "@/lib/format";
import type { AccountRecord } from "@/lib/index-types";
import {
  ask,
  askText,
  notify,
  disconnectAccount,
  filesIn,
  moveOffAccount,
  movePriority,
  reconnectAccount,
  removeAccount,
  setBuffer,
  type AccountRuntime,
} from "@/lib/nebula-store";
import { Icon } from "./Icon";
import { Menu } from "./Menu";

const GB = 1024 ** 3;

const DRAG_TYPE = "application/x-nebula-account";

export function AccountCard({
  account,
  runtime,
  position,
  count,
  onReorder,
}: {
  account: AccountRecord;
  runtime?: AccountRuntime;
  position: number;
  count: number;
  // Moves the dragged account to this card's place.
  onReorder: (dragged: string, target: string) => void;
}) {
  const [over, setOver] = useState(false);
  const connected = runtime?.connected ?? false;
  const total = runtime?.total ?? 0;
  const used = runtime?.used ?? 0;
  const usable = Math.max(0, total - used - account.buffer);
  const held = filesIn(account.email);

  // Copies every piece to the other accounts, then deletes it here.
  const moveOff = async () => {
    const ok = await ask({
      title: `Move files off ${account.email}?`,
      body:
        `${held.length} file${held.length === 1 ? "" : "s"} (or pieces of them) are copied to your other ` +
        "connected accounts, checked, and only then deleted here. Keep this tab open until it finishes.",
      confirm: "Move files",
    });

    if (!ok) return;

    await moveOffAccount(account.email);
  };

  const remove = async () => {
    if (held.length > 0) {
      const ok = await ask({
        title: `${account.email} still holds files`,
        body:
          `${held.length} Nebula file${held.length === 1 ? " is" : "s are"} stored (at least partly) in this account, ` +
          "including any in the trash. Removing it now would make them unreadable.\n\n" +
          "Nebula can move them to your other accounts first, if they have room.",
        confirm: "Move files, then remove",
      });

      if (ok) {
        if (!connected) {
          await ask({ title: "Reconnect first", body: `Reconnect ${account.email} so Nebula can read its files.`, confirm: "OK", cancel: "Close" });

          return;
        }

        await moveOffAccountThenRemove();
      }

      return;
    }

    const ok = await ask({
      title: `Remove ${account.email}?`,
      body:
        "Nebula stops using this account and forgets its login. It holds no Nebula files, " +
        "so nothing is lost. You can connect it again later.",
      confirm: "Remove account",
      danger: true,
    });

    if (ok) void removeAccount(account.email);
  };

  async function moveOffAccountThenRemove() {
    await moveOffAccount(account.email);

    if (filesIn(account.email).length === 0) await removeAccount(account.email);
  }

  const dragProps = {
    draggable: true,
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(DRAG_TYPE, account.email);
    },
    onDragOver: (event: DragEvent) => {
      if (event.dataTransfer.types.includes(DRAG_TYPE)) {
        event.preventDefault();
        setOver(true);
      }
    },
    onDragLeave: () => setOver(false),
    onDrop: (event: DragEvent) => {
      setOver(false);

      const dragged = event.dataTransfer.getData(DRAG_TYPE);

      if (dragged && dragged !== account.email) {
        event.preventDefault();
        onReorder(dragged, account.email);
      }
    },
  };

  // "Keep free for Gmail and Photos", asked for in a small dialog.
  const editBuffer = async () => {
    const answer = await askText({
      title: "Keep free for Gmail and Photos",
      body: `Nebula leaves this much of ${account.email} unused, so Gmail and Google Photos keep working.`,
      label: "Gigabytes",
      value: String(account.buffer / GB),
      confirm: "Save",
    });

    if (answer === null) return;

    const value = Number(answer.replace(",", "."));

    if (!Number.isFinite(value) || value < 0) {
      notify("error", "Enter 0 or a positive number of gigabytes.");

      return;
    }

    setBuffer(account.email, value * GB);
  };

  const fraction = total > 0 ? Math.min(1, used / total) : 0;

  return (
    <li
      {...dragProps}
      className={`flex h-[68px] items-center gap-3 rounded-[16px] border border-border px-3 font-sans transition-colors md:gap-4 md:px-4 ${
        over ? "bg-lime" : "bg-paper"
      }`}
    >
      <span className="hidden cursor-grab text-muted sm:block" title="Drag to change priority">
        <Icon name="drag" />
      </span>
      <span
        title={`Priority ${position + 1}`}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-border bg-card font-mono text-sm font-bold"
      >
        {position + 1}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <p className="truncate text-base font-semibold">{account.email}</p>
          <span className={`shrink-0 text-xs font-medium ${connected ? "text-[#1f8f3a]" : "text-danger"}`}>
            {connected ? "● Connected" : "● Signed out"}
          </span>
        </div>
        {connected && total > 0 ? (
          <div className="flex items-center gap-3">
            <div className="h-2 w-full max-w-[220px] overflow-hidden rounded-full border border-border bg-track">
              <div className="h-full rounded-full bg-accent" style={{ width: `${fraction * 100}%` }} />
            </div>
            <span className="hidden truncate text-xs text-muted md:inline">
              {formatBytes(used)} of {formatBytes(total)} · {formatBytes(usable)} usable ·{" "}
              <Link className="underline underline-offset-2" href={`/files/?account=${encodeURIComponent(account.email)}`}>
                {held.length} file{held.length === 1 ? "" : "s"}
              </Link>
            </span>
          </div>
        ) : (
          <span className="truncate text-xs text-muted">
            {connected
              ? "Google reports no storage limit, so files are not placed here automatically."
              : `${held.length} file${held.length === 1 ? "" : "s"} stored here · reconnect to use it`}
          </span>
        )}
      </div>

      {!connected && (
        <button className="btn btn-primary h-9" onClick={() => reconnectAccount(account.email)}>
          Reconnect
        </button>
      )}
      <div className="hidden gap-1.5 sm:flex">
        <button className="btn btn-icon h-9 w-9" disabled={position === 0} aria-label={`Raise priority of ${account.email}`}
          onClick={() => movePriority(account.email, -1)}>
          <Icon name="up" />
        </button>
        <button className="btn btn-icon h-9 w-9" disabled={position === count - 1} aria-label={`Lower priority of ${account.email}`}
          onClick={() => movePriority(account.email, 1)}>
          <Icon name="down" />
        </button>
      </div>
      <Menu
        compact
        label={`Actions for ${account.email}`}
        items={[
          ...(position > 0 ? [{ label: "Move up", icon: "up" as const, onSelect: () => movePriority(account.email, -1) }] : []),
          ...(position < count - 1 ? [{ label: "Move down", icon: "down" as const, onSelect: () => movePriority(account.email, 1) }] : []),
          { label: `Keep free: ${account.buffer / GB} GB`, icon: "rename", onSelect: () => void editBuffer() },
          ...(held.length > 0
            ? [{ label: "Move files off", icon: "move" as const, onSelect: () => void moveOff(), disabled: !connected }]
            : []),
          connected
            ? { label: "Disconnect", icon: "close" as const, onSelect: () => disconnectAccount(account.email) }
            : { label: "Reconnect", icon: "restore" as const, onSelect: () => void reconnectAccount(account.email) },
          { label: "Remove from Nebula", icon: "trash", danger: true, onSelect: () => void remove() },
        ]}
      />
    </li>
  );
}
