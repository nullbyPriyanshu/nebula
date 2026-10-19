"use client";

import { useRef } from "react";
import { useNebula } from "@/context/NebulaContext";
import { ROOT } from "@/lib/folders";
import { formatBytes } from "@/lib/format";
import { dismissInterrupted, enqueue } from "@/lib/nebula-store";

// After a reload: uploads that were still running. Browsers forget picked
// files on reload, so the student picks them again; each then goes back to its
// original folder and continues where it stopped.
export function InterruptedBanner() {
  const { interrupted, mode } = useNebula();
  const picker = useRef<HTMLInputElement>(null);

  if (mode !== "private" || interrupted.length === 0) return null;

  const bytes = interrupted.reduce((sum, entry) => sum + entry.size, 0);
  const names = interrupted.slice(0, 2).map((entry) => entry.name).join(", ");

  return (
    <section
      aria-label="Interrupted uploads"
      className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-[20px] border border-border bg-lime/50 px-5 py-3"
    >
      <p className="min-w-0 font-sans text-sm">
        <span className="font-semibold">
          {interrupted.length} upload{interrupted.length === 1 ? " was" : "s were"} interrupted
        </span>{" "}
        <span className="text-muted">
          ({names}{interrupted.length > 2 ? ` and ${interrupted.length - 2} more` : ""}, {formatBytes(bytes)}).
          Pick the same files to continue where they stopped.
        </span>
      </p>
      <div className="flex gap-2">
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            // Each recognised file returns to its own folder; anything else lands at the top.
            if (event.target.files?.length) enqueue([...event.target.files], ROOT);
            event.target.value = "";
          }}
        />
        <button className="btn btn-primary h-9" onClick={() => picker.current?.click()}>
          Pick the files
        </button>
        <button className="btn h-9" onClick={dismissInterrupted}>
          Dismiss
        </button>
      </div>
    </section>
  );
}
