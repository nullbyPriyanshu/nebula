"use client";

import { useState } from "react";
import { useNebula } from "@/context/NebulaContext";
import {
  growthByMonth,
  largestFiles,
  spaceByAccount,
  spaceByKind,
  uploadsPerWeek,
  type Bar,
} from "@/lib/analytics";
import { formatBytes } from "@/lib/format";
import { AppPage } from "@/components/site/AppPage";
import { Stat, StatRow } from "@/components/site/Stat";

// An account this full gets a warning.
const NEARLY_FULL = 0.9;

function Bars({
  title,
  bars,
  format,
  note,
}: {
  title: string;
  bars: Bar[];
  format: (value: number) => string;
  note?: string;
}) {
  const max = Math.max(1, ...bars.map((bar) => bar.value));

  return (
    <section data-reveal className="card card-lift space-y-5">
      <div>
        <h2 className="card-title">{title}</h2>
        {note && <p className="mt-1 font-sans text-sm font-light text-muted">{note}</p>}
      </div>
      {bars.length === 0 && <p className="font-sans text-base text-muted">No files yet.</p>}
      <ul className="space-y-4">
        {bars.map((bar, i) => (
          <li key={`${bar.label}-${i}`} className="font-sans text-base">
            <div className="flex justify-between gap-3">
              <span className="min-w-0 truncate">{bar.label}</span>
              <span className="shrink-0 font-mono text-sm text-muted">{format(bar.value)}</span>
            </div>
            <div className="mt-1.5 h-3 overflow-hidden rounded-full border border-border bg-track">
              <div className="h-full rounded-full bg-accent transition-[width] duration-700"
                style={{ width: `${(bar.value / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function AnalyticsPage() {
  const { index, runtime } = useNebula();
  // Read the clock once, in the browser only.
  const [now] = useState(() => Date.now());

  const files = index.files.filter((file) => !file.trashedAt);

  const full = index.accounts
    .map((account) => ({ email: account.email, ...runtime[account.email] }))
    .filter((a) => a.connected && a.total > 0 && a.used / a.total >= NEARLY_FULL);

  const stored = files.reduce((sum, file) => sum + file.size, 0);
  const month = new Date(now);
  const thisMonth = files.filter((file) => {
    const at = new Date(file.uploadedAt);

    return at.getFullYear() === month.getFullYear() && at.getMonth() === month.getMonth();
  }).length;

  return (
    <AppPage
      tag="Analytics"
      title="Your storage at a glance"
      lead="Worked out in this browser from your file list. Nothing is sent to any analytics service."
    >
      <div data-reveal>
        <StatRow>
          <Stat value={formatBytes(stored)} label="stored" note="not counting copies" />
          <Stat value={files.length} label="files" />
          <Stat value={thisMonth} label="uploaded" note="this month" />
          <Stat value={index.accounts.length} label="accounts" note="in the pool" />
        </StatRow>
      </div>

      {full.length > 0 && (
        <section data-reveal className="card space-y-2 border-danger" role="status">
          <h2 className="card-title text-danger">Nearly full</h2>
          {full.map((a) => (
            <p key={a.email} className="font-sans text-base font-light">
              {a.email} is {Math.round((a.used / a.total) * 100)}% full ({formatBytes(a.total - a.used)} left).
              Nebula keeps its buffer free, so new files go elsewhere. Emptying the trash or moving files
              off it on the Accounts page frees space.
            </p>
          ))}
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Bars title="Space per account" bars={spaceByAccount(files)} format={formatBytes} />
        <Bars title="Space by file type" bars={spaceByKind(files)} format={formatBytes} />
        <Bars title="Largest files" bars={largestFiles(files)} format={formatBytes} />
        <Bars
          title="Stored over time"
          note="Size of today's files by when they were uploaded, at the end of each month."
          bars={growthByMonth(files, now)}
          format={formatBytes}
        />
        <div className="lg:col-span-2">
          <Bars
            title="Uploads per week"
            bars={uploadsPerWeek(files, now)}
            format={(value) => `${value} file${value === 1 ? "" : "s"}`}
          />
        </div>
      </div>
    </AppPage>
  );
}
