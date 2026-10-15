"use client";

import { useNebula } from "@/context/NebulaContext";
import { reconnectAccount } from "@/lib/nebula-store";

// Logins live only in memory, so after every reload each account needs one
// click. Browsers allow one sign-in popup per click, hence one button per account.
export function ReconnectBanner() {
  const { index, runtime, queue } = useNebula();

  const offline = [...index.accounts]
    .sort((a, b) => a.priority - b.priority)
    .filter((account) => !runtime[account.email]?.connected);

  if (offline.length === 0) {
    return null;
  }

  const waiting = queue.filter(
    (item) => item.status === "paused" && item.pausedBy === "login",
  ).length;
  const all = offline.length === index.accounts.length;

  return (
    <section className="card space-y-3 border-accent" aria-label="Reconnect accounts">
      <div className="text-sm">
        <p className="font-medium">
          {all
            ? "Sign in again to use your files"
            : `${offline.length} account${offline.length === 1 ? " needs" : "s need"} signing in again`}
        </p>
        <p className="text-muted">
          Nebula never stores logins, so each account needs one click per visit.
          {waiting > 0 &&
            ` ${waiting} upload${waiting === 1 ? " is" : "s are"} paused and will continue once you reconnect.`}
        </p>
      </div>
      <ul className="flex flex-wrap gap-2">
        {offline.map((account) => (
          <li key={account.email}>
            <button
              className="btn btn-primary max-w-full"
              onClick={() => reconnectAccount(account.email)}
            >
              <span className="truncate">Reconnect {account.email}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
