"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./Icon";

export type MenuItem = {
  label: string;
  icon: IconName;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
};

// Room the menu wants below its button before it opens upwards instead.
const MENU_HEIGHT = 360;

// The "⋯" overflow menu: arrow keys move, Escape closes, focus returns to the button.
// It is drawn in a portal at a fixed position, so rows that clip their contents
// (content-visibility) or scroll cannot hide it.
export function Menu({ label, items, compact }: { label: string; items: MenuItem[]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<CSSProperties>({});
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();

  // Fixed position next to the button, opening upwards when there is no room below.
  const measure = () => {
    const rect = button.current!.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    const right = Math.max(8, window.innerWidth - rect.right);

    setPlace(
      below < MENU_HEIGHT && rect.top > below
        ? { bottom: window.innerHeight - rect.top + 4, right }
        : { top: rect.bottom + 4, right },
    );
  };

  const enabled = () =>
    [...(list.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];

  useEffect(() => {
    if (!open) return;

    enabled()[0]?.focus();

    const close = (event: PointerEvent) => {
      const target = event.target as Node;

      if (!list.current?.contains(target) && !button.current?.contains(target)) {
        setOpen(false);
      }
    };

    // Follow the button when the page scrolls or resizes.
    const follow = (event: Event) => {
      if (!list.current?.contains(event.target as Node)) measure();
    };

    document.addEventListener("pointerdown", close);
    window.addEventListener("resize", follow);
    window.addEventListener("scroll", follow, true);

    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", follow);
      window.removeEventListener("scroll", follow, true);
    };
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);

      return;
    }

    measure();
    setOpen(true);
  };

  const shut = () => {
    setOpen(false);
    button.current?.focus();
  };

  return (
    <div className="relative">
      <button
        ref={button}
        className={`btn btn-icon ${compact ? "h-9 w-9" : ""}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={toggle}
      >
        <Icon name="more" />
      </button>
      {open && createPortal(
        <ul
          ref={list}
          id={id}
          role="menu"
          aria-label={label}
          style={place}
          className="pop-in fixed z-50 max-h-[calc(100vh-1rem)] min-w-48 overflow-y-auto rounded-[16px] border border-ink bg-vanilla p-1.5 text-ink shadow-[4px_4px_0_0_#383838]"
          onKeyDown={(event) => {
            const buttons = enabled();
            const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
            const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];

            if (step) {
              event.preventDefault();
              buttons[(at + step + buttons.length) % buttons.length]?.focus();
            } else if (event.key === "Home" || event.key === "End") {
              event.preventDefault();
              buttons.at(event.key === "Home" ? 0 : -1)?.focus();
            } else if (event.key === "Escape" || event.key === "Tab") {
              event.preventDefault();
              shut();
            }
          }}
        >
          {items.map((item) => (
            <li key={item.label} role="none">
              <button
                role="menuitem"
                disabled={item.disabled}
                className={`flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left font-sans text-sm outline-none transition-colors hover:bg-[#e5ded5] focus-visible:bg-[#e5ded5] disabled:opacity-50 ${
                  item.danger ? "text-danger" : ""
                }`}
                onClick={() => {
                  shut();
                  item.onSelect();
                }}
              >
                <Icon name={item.icon} />
                {item.label}
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}
