"use client";

import { useNebula } from "@/context/NebulaContext";
import type { Routing, Theme } from "@/lib/index-types";
import {
  chooseMode,
  logoutAll,
  setRouting,
  setSafeMode,
  setTheme,
} from "@/lib/nebula-store";

export default function SettingsPage() {
  const { index, mode } = useNebula();
  const { routing, theme, safeMode } = index.settings;

  return (
    <div className="space-y-4">
      <section className="card space-y-2">
        <h2 className="font-semibold">Routing</h2>
        <p className="text-sm text-muted">
          Which account receives a new file. Both keep each account&apos;s free
          buffer and split a file only when no single account fits it.
        </p>
        <select className="field" aria-label="Routing" value={routing}
          onChange={(event) => setRouting(event.target.value as Routing)}>
          <option value="priority">Priority: fill accounts in order</option>
          <option value="least-used">Least-used: spread evenly</option>
        </select>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">Safe mode</h2>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={safeMode}
            onChange={(event) => setSafeMode(event.target.checked)} />
          <span>
            Store a second copy of every new file in another account. Uses twice
            the space; needs at least two connected accounts with room.
          </span>
        </label>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">Theme</h2>
        <select className="field" aria-label="Theme" value={theme}
          onChange={(event) => setTheme(event.target.value as Theme)}>
          <option value="system">Follow system</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">Public PC mode</h2>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={mode === "public"}
            onChange={(event) => chooseMode(event.target.checked ? "public" : "private")}
          />
          <span>
            Save nothing on this computer and log out after 5 idle minutes or
            when the tab closes. Turning this on erases the file list saved in
            this browser; your files and the copies in your accounts stay.
          </span>
        </label>
        <button className="btn btn-danger" onClick={logoutAll}>
          Log out of every account now
        </button>
      </section>
    </div>
  );
}
