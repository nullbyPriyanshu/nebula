"use client";

import Link from "next/link";
import { useState, type DragEvent } from "react";
import { formatBytes } from "@/lib/format";
import type { AccountRecord } from "@/lib/index-types";
import {
  ask,
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

const GB = 1024 ** 3;

const DRAG_TYPE = "application/x-nebula-account";

// Saves on blur or Enter, never mid-typing, and refuses negative numbers.
function BufferField({ account }: { account: AccountRecord }) {
  const saved = String(account.buffer / GB);
  const [draft, setDraft] = useState<string | null>(null);

  const save = () => {
    if (draft === null) return;

    const value = Number(draft);

    if (draft.trim() !== "" && Number.isFinite(value) && value >= 0) {
      setBuffer(account.email, value * GB);
    }

    setDraft(null);
  };

  const value = draft ?? saved;
  const invalid = draft !== null && (draft.trim() === "" || !(Number(draft) >= 0));

  return (
    <label className="flex flex-wrap items-center gap-2 font-sans text-base text-muted">
      Keep free for Gmail and Photos
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={0.5}
        className={`field w-24 ${invalid ? "border-danger" : ""}`}
        aria-invalid={invalid}
        value={value}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") save();
          if (event.key === "Escape") setDraft(null);
        }}
      />
      GB
      {invalid && <span className="text-danger">Enter 0 or more</span>}
    </label>
  );
}

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

  return (
    <li {...dragProps} data-reveal className={`card card-lift space-y-5 ${over ? "ring-2 ring-accent" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="cursor-grab text-muted" title="Drag to change priority">
            <Icon name="drag" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-sans text-xl font-semibold">{account.email}</p>
            <p className="font-sans text-sm text-muted">
              Priority {position + 1} ·{" "}
              <span className={connected ? "text-foreground" : "text-danger"}>
                {connected ? "Connected" : "Not connected"}
              </span>
              {" · "}
              <Link className="text-accent hover:underline"
                href={`/files/?account=${encodeURIComponent(account.email)}`}>
                {held.length} file{held.length === 1 ? "" : "s"}
              </Link>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-icon" disabled={position === 0} aria-label={`Raise priority of ${account.email}`}
            onClick={() => movePriority(account.email, -1)}>
            ↑
          </button>
          <button className="btn btn-icon" disabled={position === count - 1} aria-label={`Lower priority of ${account.email}`}
            onClick={() => movePriority(account.email, 1)}>
            ↓
          </button>
          {connected ? (
            <button className="btn" onClick={() => disconnectAccount(account.email)}>
              Disconnect
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => reconnectAccount(account.email)}>
              Reconnect
            </button>
          )}
          {held.length > 0 && (
            <button className="btn" disabled={!connected} title={connected ? undefined : "Reconnect first"}
              onClick={() => void moveOff()}>
              Move files off
            </button>
          )}
          <button className="btn btn-danger" onClick={remove}>
            Remove
          </button>
        </div>
      </div>

      {connected && total > 0 && (
        <>
          <div className="h-3 overflow-hidden rounded-full border border-border bg-track">
            <div className="h-full rounded-full bg-accent"
              style={{ width: `${Math.min(100, (used / total) * 100)}%` }} />
          </div>
          <p className="font-sans text-base text-muted">
            {formatBytes(used)} of {formatBytes(total)} used ·{" "}
            <span className="text-foreground">{formatBytes(usable)} usable</span>
          </p>
        </>
      )}

      {connected && total === 0 && (
        <p className="text-sm text-muted">
          Google reports no storage limit for this account, so Nebula will not
          place files here automatically.
        </p>
      )}

      <BufferField key={account.buffer} account={account} />
    </li>
  );
}
