"use client";

import { useEffect } from "react";

// Most bubbles on screen at once; any more and new ones are skipped.
const MAX = 24;
// Distance the mouse travels between bubbles, squared (about 30px).
const SPACING = 900;

// Little bubbles drift up from behind the cursor as the mouse moves, and a
// few pop out on a click. Pure decoration: mouse only, off for reduced motion, never in the
// way of clicks or screen readers.
export function CursorBubbles() {
  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!fine || calm) return;

    const layer = document.createElement("div");

    layer.className = "bubble-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);

    let live = 0;
    let lastX = -999;
    let lastY = -999;

    // dx and dy are where the bubble ends up, relative to where it starts.
    const spawn = (x: number, y: number, size: number, dx: number, dy: number, kind: "trail" | "pop") => {
      if (live >= MAX) return;

      const bubble = document.createElement("span");

      bubble.className = `bubble bubble-${kind}`;
      bubble.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px;--dx:${dx}px;--dy:${dy}px`;
      bubble.addEventListener("animationend", () => {
        bubble.remove();
        live--;
      }, { once: true });

      live++;
      layer.appendChild(bubble);
    };

    // The arrow's tip is the mouse position; its body reaches about 15px right
    // and 22px down, so trail bubbles rise from just behind it.
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;

      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;

      if (dx * dx + dy * dy < SPACING) return;

      lastX = event.clientX;
      lastY = event.clientY;
      spawn(
        event.clientX + 10 + Math.random() * 8,
        event.clientY + 20 + Math.random() * 6,
        5 + Math.random() * 5,
        (Math.random() - 0.5) * 18,
        -38,
        "trail",
      );
    };

    const press = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;

      // A small ring, popping outwards and a little upwards.
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.5;
        const reach = 16 + Math.random() * 10;

        spawn(event.clientX + 3, event.clientY + 3, 4 + Math.random() * 5,
          Math.cos(angle) * reach, Math.sin(angle) * reach - 8, "pop");
      }
    };

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", press, { passive: true });

    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", press);
      layer.remove();
    };
  }, []);

  return null;
}
