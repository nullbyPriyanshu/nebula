"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

export type Option<T extends string> = { value: T; label: string };

// Room the list wants below its button before it opens upwards instead.
const LIST_HEIGHT = 320;

// A dropdown in Nebula's style, replacing <select>: the browser's own popup is
// drawn by the system, so it can't be styled and drops the site's cursor.
// Keyboard: arrows, Home/End, Enter or Space to pick, Escape to close, and
// typing jumps to the first option starting with those letters.
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  className = "",
}: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<CSSProperties>({});
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const id = useId();

  const chosen = Math.max(0, options.findIndex((option) => option.value === value));
  const current = options[chosen];

  // Fixed below the button (or above, near the bottom of the screen), at least as wide.
  const measure = () => {
    const rect = button.current!.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    const up = below < LIST_HEIGHT && rect.top > below;

    setPlace({
      left: Math.min(rect.left, window.innerWidth - Math.max(rect.width, 180) - 8),
      minWidth: rect.width,
      ...(up ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
    });
  };

  const show = () => {
    measure();
    setActive(chosen);
    setOpen(true);
  };

  const hide = (refocus = true) => {
    setOpen(false);

    if (refocus) button.current?.focus();
  };

  const pick = (index: number) => {
    onChange(options[index].value);
    hide();
  };

  useEffect(() => {
    if (!open) return;

    list.current?.focus();

    const outside = (event: PointerEvent) => {
      const target = event.target as Node;

      if (!list.current?.contains(target) && !button.current?.contains(target)) hide(false);
    };
    const follow = (event: Event) => {
      if (!list.current?.contains(event.target as Node)) measure();
    };

    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", follow);
    window.addEventListener("scroll", follow, true);

    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", follow);
      window.removeEventListener("scroll", follow, true);
    };
  }, [open]);

  // Keep the highlighted option in view in long lists.
  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);

  const typeahead = (key: string, now: number) => {
    const text = (now - typed.current.at < 600 ? typed.current.text : "") + key.toLowerCase();

    typed.current = { text, at: now };

    const match = options.findIndex((option) => option.label.toLowerCase().startsWith(text));

    if (match >= 0) setActive(match);
  };

  const onListKey = (event: KeyboardEvent) => {
    const last = options.length - 1;
    const keys: Record<string, () => void> = {
      ArrowDown: () => setActive((a) => Math.min(last, a + 1)),
      ArrowUp: () => setActive((a) => Math.max(0, a - 1)),
      Home: () => setActive(0),
      End: () => setActive(last),
      Enter: () => pick(active),
      " ": () => pick(active),
      Escape: () => hide(),
      Tab: () => hide(),
    };

    if (keys[event.key]) {
      event.preventDefault();
      keys[event.key]();
    } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      typeahead(event.key, event.timeStamp);
    }
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`${label}: ${current?.label ?? ""}`}
        onClick={() => (open ? hide() : show())}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            show();
          }
        }}
        className={`flex h-11 items-center justify-between gap-2 rounded-[13px] border border-border bg-paper pl-3 pr-2.5 font-sans text-sm text-foreground transition-colors hover:bg-track ${
          open ? "bg-track" : ""
        } ${className}`}
      >
        <span className="truncate">{current?.label}</span>
        <Icon name="down" className={`h-4 w-4 shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && createPortal(
        <ul
          ref={list}
          id={id}
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          aria-activedescendant={`${id}-${active}`}
          onKeyDown={onListKey}
          style={place}
          className="pop-in fixed z-50 max-h-[min(320px,60vh)] max-w-[min(360px,calc(100vw-1rem))] overflow-y-auto rounded-[16px] border border-ink bg-vanilla p-1.5 font-sans text-sm text-ink shadow-[4px_4px_0_0_#383838] outline-none"
        >
          {options.map((option, i) => {
            const selected = i === chosen;

            return (
              <li
                key={option.value}
                id={`${id}-${i}`}
                role="option"
                aria-selected={selected}
                onPointerEnter={() => setActive(i)}
                onClick={() => pick(i)}
                className={`flex items-center justify-between gap-4 rounded-[10px] px-3 py-2 transition-colors ${
                  selected ? "bg-lime font-semibold" : i === active ? "bg-[#e5ded5]" : ""
                } ${i === active && selected ? "ring-1 ring-ink" : ""}`}
              >
                <span className="truncate">{option.label}</span>
                {selected && <Icon name="check" className="h-4 w-4 shrink-0" />}
              </li>
            );
          })}
        </ul>,
        document.body,
      )}
    </>
  );
}
