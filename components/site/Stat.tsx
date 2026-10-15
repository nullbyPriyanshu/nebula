import type { ReactNode } from "react";

// A big monospace figure with a label, like the stats on the landing page.
export function Stat({ value, label, note }: { value: ReactNode; label: string; note?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-3 py-6 text-center max-md:py-4">
      <p className="font-mono text-[44px] font-bold leading-tight max-md:text-2xl">{value}</p>
      <p className="font-sans text-base font-semibold">{label}</p>
      {note && <p className="font-sans text-sm font-light text-muted">{note}</p>}
    </div>
  );
}

// A row of stats in one outlined card. The 1px gap shows the border colour
// behind, drawing the dividers for any number of columns.
export function StatRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[24px] border border-border bg-border lg:grid-cols-4 [&>*]:bg-card">
      {children}
    </div>
  );
}
