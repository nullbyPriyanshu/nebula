import { formatBytes } from "@/lib/format";

const RADIUS = 40;
const LENGTH = 2 * Math.PI * RADIUS;

// Combined space of the connected accounts, as a ring with a charcoal outline.
export function SpaceRing({ used, total }: { used: number; total: number }) {
  const fraction = total > 0 ? Math.min(1, used / total) : 0;

  return (
    <div className="flex items-center gap-6 max-md:gap-4">
      <svg viewBox="0 0 100 100" className="h-32 w-32 shrink-0 -rotate-90 max-md:h-24 max-md:w-24" role="img"
        aria-label={`${Math.round(fraction * 100)}% of pooled space used`}>
        <circle cx="50" cy="50" r={RADIUS + 7} fill="none" strokeWidth="1.5" className="stroke-border" />
        <circle cx="50" cy="50" r={RADIUS - 7} fill="none" strokeWidth="1.5" className="stroke-border" />
        <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="12.5" className="stroke-track" />
        <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="12.5"
          className="stroke-accent transition-[stroke-dasharray] duration-700"
          strokeDasharray={`${fraction * LENGTH} ${LENGTH}`} />
      </svg>
      <div>
        <p className="font-mono text-[40px] font-bold leading-tight max-md:text-3xl">
          {formatBytes(Math.max(0, total - used))}
        </p>
        <p className="font-sans text-lg font-semibold">free across your accounts</p>
        <p className="font-sans text-sm font-light text-muted">
          {formatBytes(used)} used of {formatBytes(total)}
        </p>
      </div>
    </div>
  );
}
