import { formatBytes } from "@/lib/format";

const RADIUS = 40;
const LENGTH = 2 * Math.PI * RADIUS;

// Combined space of the connected accounts, as a ring with a charcoal outline.
export function SpaceRing({ used, total, compact }: { used: number; total: number; compact?: boolean }) {
  const fraction = total > 0 ? Math.min(1, used / total) : 0;

  return (
    <div className={`flex items-center ${compact ? "gap-4" : "gap-6 max-md:gap-4"}`}>
      <svg viewBox="0 0 100 100" className={`shrink-0 -rotate-90 ${compact ? "h-20 w-20" : "h-32 w-32 max-md:h-24 max-md:w-24"}`} role="img"
        aria-label={`${Math.round(fraction * 100)}% of pooled space used`}>
        <circle cx="50" cy="50" r={RADIUS + 7} fill="none" strokeWidth="1.5" className="stroke-border" />
        <circle cx="50" cy="50" r={RADIUS - 7} fill="none" strokeWidth="1.5" className="stroke-border" />
        <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="12.5" className="stroke-track" />
        <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="12.5"
          className="stroke-accent transition-[stroke-dasharray] duration-700"
          strokeDasharray={`${fraction * LENGTH} ${LENGTH}`} />
      </svg>
      <div>
        <p className={`font-mono font-bold leading-tight ${compact ? "text-[26px]" : "text-[40px] max-md:text-3xl"}`}>
          {formatBytes(Math.max(0, total - used))}
        </p>
        <p className={`font-sans font-semibold ${compact ? "text-sm" : "text-lg"}`}>free across your accounts</p>
        <p className="font-sans text-sm font-light text-muted">
          {formatBytes(used)} used of {formatBytes(total)}
        </p>
      </div>
    </div>
  );
}
