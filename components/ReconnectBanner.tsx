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
    <section
      aria-label="Reconnect accounts"
      className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-[20px] border border-accent bg-sky/40 px-5 py-3"
    >
      <p className="min-w-0 font-sans text-sm">
        <span className="font-semibold">
          {all
            ? "Sign in again to use your files."
            : `${offline.length} account${offline.length === 1 ? " needs" : "s need"} signing in again.`}
        </span>{" "}
        <span className="text-muted">
          Logins are never stored, so it is one click per visit.
          {waiting > 0 &&
            ` ${waiting} upload${waiting === 1 ? " is" : "s are"} paused until then.`}
        </span>
      </p>
      <ul className="flex flex-wrap gap-2">
        {offline.map((account) => (
          <li key={account.email}>
            <button
              className="btn btn-primary h-9 max-w-full normal-case"
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
