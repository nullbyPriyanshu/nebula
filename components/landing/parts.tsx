import type { ReactNode } from "react";

// Building blocks shared by the landing page sections.

export const INK = "#383838";

// The small lime square, a line, then a pill: the label above each section title.
export function Tag({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex items-center">
      <span className="h-[18px] w-[18px] shrink-0 rounded-[2px] border border-border bg-lime" />
      <span className="h-px w-[30px] bg-border" />
      <span className="flex h-[34px] items-center rounded-full border border-border bg-card px-4 font-sans text-xs font-medium uppercase tracking-widest text-foreground">
        {children}
      </span>
    </div>
  );
}

// A lime square, optionally drifting; positioned by the caller.
export function Square({
  className = "",
  style,
  still,
}: {
  className?: string;
  style?: React.CSSProperties;
  still?: boolean;
}) {
  return (
    <span
      aria-hidden
      style={style}
      className={`pointer-events-none absolute h-[23px] w-[23px] -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-ink bg-lime ${
        still ? "" : "drift"
      } ${className}`}
    />
  );
}

// Plain sections: no grain, four faint vertical lines and drifting squares.
const LINES = ["14%", "37.4%", "62.6%", "86%"];

export function PlainSection({
  id,
  children,
  label,
  squares = [],
}: {
  id?: string;
  children: ReactNode;
  label?: string;
  // [left, top] pairs for the decorative squares.
  squares?: [string, string][];
}) {
  return (
    <section id={id} aria-label={label} className="relative overflow-hidden bg-paper">
      <div aria-hidden className="pointer-events-none absolute inset-0 max-md:hidden">
        {LINES.map((left) => (
          <span key={left} className="absolute inset-y-0 w-px bg-line" style={{ left }} />
        ))}
        {squares.map(([left, top], i) => (
          <Square key={i} style={{ left, top, animationDelay: `${i * 1.3}s` }} />
        ))}
      </div>
      <div className="relative">{children}</div>
    </section>
  );
}

export function GrainSection({
  id,
  children,
  label,
  className = "",
}: {
  id?: string;
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <section id={id} aria-label={label} className={`grain relative overflow-hidden bg-background ${className}`}>
      {children}
    </section>
  );
}

export const Container = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`mx-auto w-full max-w-[1272px] px-6 md:px-10 ${className}`}>{children}</div>
);

export function Arrow({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

export function Chevron({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

// Nebula's mark: a planet with an orbiting moon.
export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className={className}>
      <circle cx="16" cy="16" r="14" fill="#058bff" />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="#fff" strokeWidth="2.6" />
      <circle cx="16" cy="16" r="3.6" fill="#fff" />
      <circle cx="24.5" cy="7.5" r="3" fill="#b095fa" stroke="#383838" strokeWidth="1.2" />
    </svg>
  );
}

// Line icons drawn on a 24-unit grid.
const GLYPHS = {
  code: "M8 8l-4 4 4 4M16 8l4 4-4 4",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  shield: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z M9 12l2 2 4-4",
  play: "M8 5v14l11-7z",
  undo: "M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  check: "M5 12.5l4.5 4.5L19 7.5",
  server: "M4 5h16v5H4zM4 14h16v5H4zM7 7.5h.01M7 16.5h.01",
  bars: "M6 20V12M12 20V6M18 20v-4",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  zero: "M12 4c-4 0-6 3.5-6 8s2 8 6 8 6-3.5 6-8-2-8-6-8zM8 17L16 7",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6",
  sparkle: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6",
  minus: "M5 19h14",
  close: "M6 6l12 12M18 6L6 18",
  square: "M6 6h12v12H6z",
} as const;

export function Glyph({ name, className = "h-5 w-5" }: { name: keyof typeof GLYPHS; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={GLYPHS[name]} />
    </svg>
  );
}

// An icon in the small rounded, bordered box used beside feature titles.
export function IconBox({ name, size = "h-12 w-12" }: { name: keyof typeof GLYPHS; size?: string }) {
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center rounded-[10px] border border-border bg-track text-foreground`}>
      <Glyph name={name} />
    </span>
  );
}
