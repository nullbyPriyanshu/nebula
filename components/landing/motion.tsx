"use client";

import { useEffect } from "react";

// Gentle entrance for page sections. Stays still for people who ask their
// system for reduced motion.

const reduced = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Elements marked data-reveal fade and rise into place the first time they
// scroll into view. Call once per page.
export function useReveal(key: string) {
  useEffect(() => {
    const root = document.documentElement;
    const pending = () =>
      [...document.querySelectorAll<HTMLElement>("[data-reveal]:not([data-shown])")];

    if (reduced()) {
      const showAll = () => pending().forEach((element) => (element.dataset.shown = "true"));
      const mutations = new MutationObserver(showAll);

      showAll();
      mutations.observe(document.body, { childList: true, subtree: true });

      return () => mutations.disconnect();
    }

    root.classList.add("js");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.shown = "true";
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );

    // Elements that appear later (an upload queue, a new account) are watched too.
    const watch = () => pending().forEach((element) => observer.observe(element));
    const mutations = new MutationObserver(watch);

    watch();
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [key]);
}
