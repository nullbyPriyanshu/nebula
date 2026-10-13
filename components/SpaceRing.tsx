import { formatBytes } from "@/lib/format";

const RADIUS = 42;
const LENGTH = 2 * Math.PI * RADIUS;

// Combined space of the connected accounts.
export function SpaceRing({ used, total }: { used: number; total: number }) {
  const fraction = total > 0 ? Math.min(1, used / total) : 0;

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="h-24 w-24 shrink-0 -rotate-90" role="img"
        aria-label={`${Math.round(fraction * 100)}% of pooled space used`}>
        <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="10"
          className="stroke-border" />
        <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="10"
          strokeLinecap="round" className="stroke-accent"
          strokeDasharray={`${fraction * LENGTH} ${LENGTH}`} />
      </svg>
      <div>
        <p className="text-2xl font-semibold">
          {formatBytes(Math.max(0, total - used))} free
        </p>
        <p className="text-sm text-muted">
          {formatBytes(used)} used of {formatBytes(total)}
        </p>
      </div>
    </div>
  );
}
