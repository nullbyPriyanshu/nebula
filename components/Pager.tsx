"use client";

import { Icon } from "./Icon";

// Page numbers with at most one gap on each side: 1 … 4 5 6 … 12.
function numbers(page: number, pages: number): (number | "gap")[] {
  const keep = new Set([0, pages - 1, page - 1, page, page + 1]);
  const out: (number | "gap")[] = [];

  for (let i = 0; i < pages; i++) {
    if (keep.has(i)) out.push(i);
    else if (out.at(-1) !== "gap") out.push("gap");
  }

  return out;
}

// "13–24 of 120" and the page buttons, under a paged list.
export function Pager({
  page,
  pages,
  from,
  to,
  total,
  onGo,
}: {
  page: number;
  pages: number;
  from: number;
  to: number;
  total: number;
  onGo: (page: number) => void;
}) {
  return (
    <nav aria-label="Pages" className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2 font-sans text-sm">
      <span className="text-muted" aria-live="polite">
        <span className="font-mono text-foreground">{from}–{to}</span> of {total}
      </span>
      <div className="flex items-center gap-1.5">
        <button className="btn btn-icon h-9 w-9" aria-label="Previous page" disabled={page === 0} onClick={() => onGo(page - 1)}>
          <Icon name="left" />
        </button>
        {numbers(page, pages).map((n, i) =>
          n === "gap" ? (
            <span key={`gap-${i}`} className="px-1 text-muted" aria-hidden>…</span>
          ) : (
            <button
              key={n}
              aria-label={`Page ${n + 1}`}
              aria-current={n === page ? "page" : undefined}
              onClick={() => onGo(n)}
              className={`h-9 min-w-9 rounded-[10px] border px-2 font-mono text-sm transition-colors ${
                n === page ? "border-border bg-ink text-white" : "border-transparent hover:border-border"
              }`}
            >
              {n + 1}
            </button>
          ),
        )}
        <button className="btn btn-icon h-9 w-9" aria-label="Next page" disabled={page === pages - 1} onClick={() => onGo(page + 1)}>
          <Icon name="right" />
        </button>
      </div>
    </nav>
  );
}
