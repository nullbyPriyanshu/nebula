"use client";

import { formatBytes } from "@/lib/format";
import type { AccountRecord } from "@/lib/index-types";
import {
  disconnectAccount,
  movePriority,
  reconnectAccount,
  removeAccount,
  setBuffer,
  type AccountRuntime,
} from "@/lib/nebula-store";

const GB = 1024 ** 3;

export function AccountCard({
  account,
  runtime,
  position,
  count,
}: {
  account: AccountRecord;
  runtime?: AccountRuntime;
  position: number;
  count: number;
}) {
  const connected = runtime?.connected ?? false;
  const total = runtime?.total ?? 0;
  const used = runtime?.used ?? 0;
  const usable = Math.max(0, total - used - account.buffer);

  return (
    <li className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{account.email}</p>
          <p className="text-xs text-muted">
            Priority {position + 1} · {connected ? "Connected" : "Not connected"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" disabled={position === 0} aria-label="Higher priority"
            onClick={() => movePriority(account.email, -1)}>
            ↑
          </button>
          <button className="btn" disabled={position === count - 1} aria-label="Lower priority"
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
          <button
            className="btn btn-danger"
            onClick={() => {
              if (window.confirm(`Remove ${account.email} from Nebula?`)) {
                void removeAccount(account.email);
              }
            }}
          >
            Remove
          </button>
        </div>
      </div>

      {connected && total > 0 && (
        <>
          <div className="h-2 overflow-hidden rounded bg-border">
            <div className="h-full bg-accent"
              style={{ width: `${Math.min(100, (used / total) * 100)}%` }} />
          </div>
          <p className="text-sm text-muted">
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

      <label className="flex items-center gap-2 text-sm text-muted">
        Keep free for Gmail and Photos
        <input
          type="number"
          min={0}
          step={0.5}
          className="field w-20"
          value={account.buffer / GB}
          onChange={(event) => setBuffer(account.email, Number(event.target.value) * GB)}
        />
        GB
      </label>
    </li>
  );
}
