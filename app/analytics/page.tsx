"use client";

import { useState } from "react";
import { useNebula } from "@/context/NebulaContext";
import {
  spaceByAccount,
  spaceByKind,
  uploadsPerWeek,
  type Bar,
} from "@/lib/analytics";
import { formatBytes } from "@/lib/format";

function Bars({
  title,
  bars,
  format,
}: {
  title: string;
  bars: Bar[];
  format: (value: number) => string;
}) {
  const max = Math.max(1, ...bars.map((bar) => bar.value));

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">{title}</h2>
      {bars.length === 0 && <p className="text-sm text-muted">No files yet.</p>}
      <ul className="space-y-2">
        {bars.map((bar) => (
          <li key={bar.label} className="text-sm">
            <div className="flex justify-between gap-2">
              <span className="min-w-0 truncate">{bar.label}</span>
              <span className="shrink-0 text-muted">{format(bar.value)}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded bg-border">
              <div className="h-full bg-accent"
                style={{ width: `${(bar.value / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function AnalyticsPage() {
  const { index } = useNebula();
  // Read the clock once, in the browser only.
  const [now] = useState(() => Date.now());

  const files = index.files.filter((file) => !file.trashedAt);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Worked out in this browser from your file list. Nothing is sent to any
        analytics service.
      </p>
      <Bars title="Space per account" bars={spaceByAccount(files)} format={formatBytes} />
      <Bars title="Space by file type" bars={spaceByKind(files)} format={formatBytes} />
      <Bars
        title="Uploads per week"
        bars={uploadsPerWeek(files, now)}
        format={(value) => `${value} file${value === 1 ? "" : "s"}`}
      />
    </div>
  );
}
