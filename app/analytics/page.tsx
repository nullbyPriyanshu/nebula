"use client";

import { useEffect, useRef, useState } from "react";
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
import { AppPage, Panel } from "@/components/site/AppPage";
import { Stat, StatRow } from "@/components/site/Stat";

// An account this full gets a warning.
const NEARLY_FULL = 0.9;

// Lists show at most this many entries, fewer if the panel is short; the rest
// are summed up underneath.
const TOP = 5;
// One list row: label line, bar, and the gap after it.
const ROW = 58;
const MORE = 24;

function Tabs<T extends string>({ tabs, value, onChange, label }: {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1 rounded-full border border-border bg-paper p-1">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={`rounded-full px-3 py-1 font-sans text-sm transition-colors ${
            value === tab.value ? "bg-ink font-medium text-white" : "text-muted hover:text-foreground"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function BarList({ bars, format }: { bars: Bar[]; format: (value: number) => string }) {
  const max = Math.max(1, ...bars.map((bar) => bar.value));
  const box = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(TOP);

  // As many rows as the panel holds, so nothing is ever cut off.
  useEffect(() => {
    const element = box.current;

    if (!element) return;

    const measure = () => {
      const wide = window.matchMedia("(min-width: 1024px)").matches;
      const rows = wide ? Math.floor((element.clientHeight - MORE + 16) / ROW) : TOP;

      setFits(Math.max(1, Math.min(TOP, rows)));
    };

    measure();

    const observer = new ResizeObserver(measure);

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const shown = bars.slice(0, fits);
  const rest = bars.length - shown.length;

  return (
    <div ref={box} className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      {bars.length === 0 && <p className="m-auto font-sans text-base text-muted">No files yet.</p>}
      <ul className="space-y-4">
        {shown.map((bar, i) => (
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
      {rest > 0 && <p className="font-sans text-sm text-muted">+{rest} more</p>}
    </div>
  );
}

// A column per period, stretching to whatever height the panel has.
function Columns({ bars, format, label }: { bars: Bar[]; format: (value: number) => string; label: string }) {
  const max = Math.max(1, ...bars.map((bar) => bar.value));
  const total = bars.reduce((sum, bar) => sum + bar.value, 0);

  return (
    <div className="flex min-h-[180px] flex-1 flex-col">
      <div
        role="img"
        aria-label={`${label}: ${bars.map((bar) => `${bar.label} ${format(bar.value)}`).join(", ")}`}
        className="flex flex-1 items-stretch gap-2"
      >
        {bars.map((bar, i) => {
          const height = bar.value > 0 ? Math.max(6, (bar.value / max) * 100) : 0;

          return (
            <div key={`${bar.label}-${i}`} title={`${bar.label}: ${format(bar.value)}`}
              className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <span className="h-3 font-mono text-[11px] leading-none text-muted">{bar.value > 0 ? format(bar.value) : ""}</span>
              <div className="relative w-full flex-1 border-b border-border">
                <div
                  className={`absolute inset-x-[14%] bottom-0 rounded-t-[6px] transition-[height] duration-700 ${
                    height > 0 ? "border border-b-0 border-border bg-accent" : ""
                  }`}
                  style={{ height: `${height}%` }}
                />
              </div>
              <span className="w-full truncate text-center font-sans text-xs text-muted">{bar.label}</span>
            </div>
          );
        })}
      </div>
      {total === 0 && <p className="pt-2 text-center font-sans text-sm text-muted">Nothing yet in this period.</p>}
    </div>
  );
}

type Space = "account" | "type" | "largest";
type Activity = "stored" | "uploads";

export default function AnalyticsPage() {
  const { index, runtime } = useNebula();
  // Read the clock once, in the browser only.
  const [now] = useState(() => Date.now());
  const [space, setSpace] = useState<Space>("account");
  const [activity, setActivity] = useState<Activity>("stored");

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

  const spaceBars = {
    account: spaceByAccount(files),
    type: spaceByKind(files),
    largest: largestFiles(files),
  }[space];

  // Health sits in the header: calm when fine, red when an account is nearly full.
  const health = (
    <span
      role="status"
      title={full.map((a) => `${a.email}: ${Math.round((a.used / a.total) * 100)}% full`).join("\n") || undefined}
      className={`flex h-11 items-center gap-2 rounded-full border px-4 font-sans text-sm font-medium ${
        full.length > 0 ? "border-danger bg-[#fdecea] text-danger" : "border-border bg-card"
      }`}
    >
      <span className={`h-2.5 w-2.5 rounded-full border border-border ${full.length > 0 ? "bg-melon" : "bg-[#28c840]"}`} />
      {full.length === 0
        ? "Every account has room"
        : full.length === 1
          ? `${full[0].email} is ${Math.round((full[0].used / full[0].total) * 100)}% full`
          : `${full.length} accounts are nearly full`}
    </span>
  );

  return (
    <AppPage
      tag="Analytics"
      title="Your storage at a glance"
      lead="Worked out in this browser from your file list. Nothing is sent to any analytics service."
      art="/art/hero.svg"
      actions={health}
    >
      <div>
        <StatRow dense>
          <Stat value={formatBytes(stored)} label="stored" note="not counting copies" />
          <Stat value={files.length} label="files" />
          <Stat value={thisMonth} label="uploaded" note="this month" />
          <Stat value={index.accounts.length} label="accounts" note="in the pool" />
        </StatRow>
      </div>

      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)]">
        <Panel
          label="Where your space goes"
          title="Where your space goes"
          aside={
            <Tabs<Space>
              label="Group by"
              value={space}
              onChange={setSpace}
              tabs={[
                { value: "account", label: "By account" },
                { value: "type", label: "By type" },
                { value: "largest", label: "Largest" },
              ]}
            />
          }
          bodyClassName="flex flex-col"
        >
          <BarList bars={spaceBars} format={formatBytes} />
        </Panel>

        <Panel
          label="Activity"
          title="Activity"
          aside={
            <Tabs<Activity>
              label="Show"
              value={activity}
              onChange={setActivity}
              tabs={[
                { value: "stored", label: "Stored by month" },
                { value: "uploads", label: "Uploads by week" },
              ]}
            />
          }
          bodyClassName="flex flex-col"
        >
          {activity === "stored" ? (
            <Columns label="Stored by month" bars={growthByMonth(files, now, 6)} format={formatBytes} />
          ) : (
            <Columns label="Uploads by week" bars={uploadsPerWeek(files, now)} format={(value) => String(value)} />
          )}
        </Panel>
      </div>
    </AppPage>
  );
}
